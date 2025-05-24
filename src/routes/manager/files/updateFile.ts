import { Hono } from "hono";
import fs from "fs";
import { requiresManager } from "@/middleware/requiresManager";
import path from "path";
import { db } from "@/db";
import { files } from "@/db/schema/files";
import { file_translations } from "@/db/schema/file_translations";
import { languages } from "@/db/schema/languages";

import { optimizeImage, generateThumbnail } from "@/utils/imageOptimization";
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

  if (!currentUser?.projectId) {
    return c.json({ error: "Project ID not found for current user" }, 400);
  }

  if (!fileId) {
    return c.json({ error: "File id is required" }, 400);
  }

  const projectId = Number(currentUser.projectId);

  // Check if file exists
  const [existingFile] = await db
    .select({ path: files.path, thumbnailPath: files.thumbnailPath })
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.projectId, projectId)));

  if (!existingFile) {
    return c.json({ error: "File not found" }, 404);
  }

  let metadata: Metadata | undefined;
  if (metadataStr) {
    try {
      metadata = JSON.parse(metadataStr as string);
    } catch (error) {
      return c.json({ error: "Invalid metadata format" }, 400);
    }
  }

  const uploadDir = `./files/project-${projectId}`;
  let newUrl: string | undefined;
  let newThumbnailPath: string | undefined;
  let oldFilePath: string | undefined;
  let oldThumbnailPath: string | undefined;

  try {
    // Handle file update if provided
    if (file && file instanceof File) {
      const originalName = file.name;
      const extension = path.extname(originalName);
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(7);
      const newFileName = `${timestamp}-${randomString}${extension}`;

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Only process images
      const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(originalName);
      let finalBuffer = buffer;

      if (isImage) {
        finalBuffer = await optimizeImage(buffer);
        newThumbnailPath = await generateThumbnail(
          buffer,
          originalName,
          projectId
        );
      }

      const newFilePath = path.join(uploadDir, newFileName);
      newUrl = `/files/project-${projectId}/${newFileName}`;

      fs.writeFileSync(newFilePath, finalBuffer);

      // Store old file paths for cleanup
      if (existingFile.path) {
        oldFilePath = path.join(uploadDir, path.basename(existingFile.path));
      }
      if (existingFile.thumbnailPath) {
        oldThumbnailPath = path.join(
          uploadDir,
          path.basename(existingFile.thumbnailPath)
        );
      }
    }

    const result = await db.transaction(async (trx) => {
      // Update mefilesdia record
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
          .where(eq(file_translations.fileId, fileId))
          .execute();

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

            return trx
              .insert(file_translations)
              .values({
                projectId: projectId,
                fileId: fileId,
                languageId: language.id,
                title: translation.title,
                description: translation.description,
              })
              .execute();
          }
        );

        await Promise.all(translationPromises);
      }

      return updatedFile;
    });

    // Clean up old files after successful transaction
    if (oldFilePath && fs.existsSync(oldFilePath)) {
      fs.unlinkSync(oldFilePath);
    }
    if (oldThumbnailPath && fs.existsSync(oldThumbnailPath)) {
      fs.unlinkSync(oldThumbnailPath);
    }

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error updating file:", error);

    // Clean up new file if transaction failed
    if (newUrl) {
      const newFilePath = path.join(uploadDir, path.basename(newUrl));
      if (fs.existsSync(newFilePath)) {
        fs.unlinkSync(newFilePath);
      }
    }

    return c.json({
      error: "Failed to update file",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
