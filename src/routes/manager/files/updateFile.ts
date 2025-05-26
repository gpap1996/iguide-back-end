import { Hono } from "hono";
import fs from "fs";
import { requiresManager } from "../../../middleware/requiresManager";
import path from "path";
import { db } from "../../../db";
import { files } from "../../../db/schema/files";
import { file_translations } from "../../../db/schema/file_translations";
import { languages } from "../../../db/schema/languages";
import { storage, FILE_LIMITS } from "../../../utils/fileStorage";

import {
  optimizeImage,
  generateThumbnail,
} from "../../../utils/imageOptimization";
import { and, eq } from "drizzle-orm";

interface Translation {
  title: string;
  description: string;
}

interface Metadata {
  translations: {
    [key: string]: Translation;
  };
}

export const updateFile = new Hono().put("/:id", requiresManager, async (c) => {
  const currentUser = c.get("currentUser");
  const fileId = parseInt(c.req.param("id"));
  const body = await c.req.formData();
  const file = body.get("file");
  const type = body.get("type")?.toString();
  const metadataStr = body.get("metadata");
  const projectId = Number(currentUser.projectId);

  if (!projectId) {
    return c.json(
      {
        error: "Project ID not found for current user",
        details: "Please contact support if this issue persists.",
      },
      400
    );
  }

  if (!fileId) {
    return c.json({ error: "File id is required" }, 400);
  }

  // Check if file exists
  const [existingFile] = await db
    .select({
      path: files.path,
      thumbnailPath: files.thumbnailPath,
      type: files.type,
    })
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.projectId, projectId)));

  if (!existingFile) {
    return c.json({ error: "File not found" }, 404);
  }

  // Prevent changing file type
  if (type && type !== existingFile.type) {
    return c.json(
      {
        error: "Cannot change file type",
        details: `File type cannot be changed from ${existingFile.type} to ${type}`,
      },
      400
    );
  }

  let metadata: Metadata | undefined;
  if (metadataStr) {
    try {
      metadata = JSON.parse(metadataStr as string);
    } catch (error) {
      return c.json({ error: "Invalid metadata format" }, 400);
    }

    // Validate audio files can only have one translation
    if (type === "audio" && metadata?.translations) {
      const translationCount = Object.keys(metadata.translations).length;
      if (translationCount > 1) {
        return c.json(
          {
            error: "Audio files can have at most one translation",
            details: `Found ${translationCount} translations, but audio files can have at most 1`,
          },
          400
        );
      }
    }
  }

  let newUrl: string | undefined;
  let newThumbnailPath: string | undefined;

  try {
    // Handle file update if provided
    if (file && file instanceof File) {
      const originalName = file.name;
      const mimetype = file.type;

      // Validate file type early
      if (existingFile.type === "audio") {
        if (!FILE_LIMITS.ALLOWED_AUDIO_TYPES.includes(mimetype)) {
          return c.json(
            {
              error: "Invalid audio format",
              details: "Only MP3 files are supported",
            },
            400
          );
        }
      } else if (existingFile.type === "image") {
        if (!FILE_LIMITS.ALLOWED_IMAGE_TYPES.includes(mimetype)) {
          return c.json(
            {
              error: "Invalid image format",
              details: `File type ${mimetype} is not allowed. Allowed types: ${FILE_LIMITS.ALLOWED_IMAGE_TYPES.join(
                ", "
              )}`,
            },
            400
          );
        }
      }

      const timestamp = Date.now();
      const fileType = existingFile.type === "image" ? "images" : "audio";
      const storagePath = `project-${projectId}/${fileType}/${timestamp}-${originalName}`;

      console.log(`Processing file update for ${originalName}`);
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (existingFile.type === "image") {
        console.log("Processing image file");
        const optimizedBuffer = await optimizeImage(buffer);
        console.log(`Uploading optimized image to ${storagePath}`);
        newUrl = await storage.saveFile(optimizedBuffer, storagePath);
        console.log(`Image uploaded successfully: ${newUrl}`);

        try {
          console.log("Generating thumbnail");
          newThumbnailPath = await generateThumbnail(
            buffer,
            originalName,
            projectId,
            timestamp
          );
          console.log(`Thumbnail generated: ${newThumbnailPath}`);
        } catch (thumbnailError) {
          console.error("Thumbnail generation failed:", thumbnailError);
        }
      } else {
        console.log("Processing audio file");
        newUrl = await storage.saveFile(buffer, storagePath);
        console.log(`File uploaded successfully: ${newUrl}`);
      }
    }

    const result = await db.transaction(async (trx) => {
      // Update file record
      const updateValues: any = {};
      if (type) updateValues.type = type;
      if (newUrl) updateValues.path = newUrl;
      if (newThumbnailPath) updateValues.thumbnailPath = newThumbnailPath;
      if (file && file instanceof File) updateValues.name = file.name;

      const [updatedFile] = await trx
        .update(files)
        .set(updateValues)
        .where(eq(files.id, fileId))
        .returning();

      if (!updatedFile) {
        throw new Error("Failed to update file");
      }

      // Update translations if provided
      if (metadata?.translations) {
        // Delete existing translations
        await trx
          .delete(file_translations)
          .where(eq(file_translations.fileId, fileId));

        // Insert new translations
        const translationPromises = Object.entries(metadata.translations).map(
          async ([locale, translation]) => {
            const [language] = await trx
              .select({ id: languages.id })
              .from(languages)
              .where(
                and(
                  eq(languages.locale, locale),
                  eq(languages.projectId, projectId)
                )
              );

            if (!language) {
              throw new Error(`Language not found for locale: ${locale}`);
            }

            return trx.insert(file_translations).values({
              fileId: fileId,
              languageId: language.id,
              title: translation.title,
              description: translation.description,
            });
          }
        );

        await Promise.all(translationPromises);
      }

      return updatedFile;
    });

    // Clean up old files after successful transaction
    if (newUrl && existingFile.path) {
      try {
        await storage.deleteFile(existingFile.path);
      } catch (error) {
        console.error("Error deleting old file:", error);
      }
    }
    if (newThumbnailPath && existingFile.thumbnailPath) {
      try {
        await storage.deleteFile(existingFile.thumbnailPath);
      } catch (error) {
        console.error("Error deleting old thumbnail:", error);
      }
    }

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error updating file:", error);

    // Clean up new files if transaction failed
    if (newUrl) {
      try {
        await storage.deleteFile(newUrl);
      } catch (deleteError) {
        console.error("Error cleaning up new file:", deleteError);
      }
    }
    if (newThumbnailPath) {
      try {
        await storage.deleteFile(newThumbnailPath);
      } catch (deleteError) {
        console.error("Error cleaning up new thumbnail:", deleteError);
      }
    }

    return c.json({
      error: "Failed to update file",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
