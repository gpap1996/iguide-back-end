import { Hono } from "hono";
import { requiresManager } from "../../../middleware/requiresManager";
import { db } from "../../../db";
import { files } from "../../../db/schema/files";
import { file_translations } from "../../../db/schema/file_translations";
import { languages } from "../../../db/schema/languages";
import { and, eq } from "drizzle-orm";
import {
  optimizeImage,
  generateThumbnail,
  IMAGE_CONFIG,
} from "../../../utils/imageOptimization";
import { parseMultipartFormBuffer } from "../../../utils/fileUpload";
import { storage } from "../../../utils/fileStorage";

interface Translation {
  title: string;
  description: string;
}

interface Metadata {
  translations?: Record<string, Translation>;
}

// Create files endpoint
export const createFile = new Hono().post("/", requiresManager, async (c) => {
  const currentUser = c.get("currentUser");

  if (!currentUser?.projectId) {
    return c.json({ error: "Project ID not found for current user" }, 400);
  }

  const projectId = Number(currentUser.projectId);

  try {
    console.log("Starting file upload process");
    // Read the body as a buffer
    const arrayBuffer = await c.req.arrayBuffer();
    const contentType = c.req.header("content-type") || "";
    const { files: uploadedFiles, fields } = parseMultipartFormBuffer(
      Buffer.from(arrayBuffer),
      contentType
    );

    console.log("Multipart form parsed successfully");
    const type = fields.type;
    const metadataStr = fields.metadata;

    if (uploadedFiles.length === 0) {
      return c.json({ error: "No file provided" }, 400);
    }

    const uploadedFile = uploadedFiles[0];
    console.log(`Processing file: ${uploadedFile.originalname}`);

    if (!type) {
      return c.json({ error: "No type provided" }, 400);
    }

    if (!metadataStr) {
      return c.json({ error: "No metadata provided" }, 400);
    }

    let metadata: Metadata;
    try {
      metadata = JSON.parse(metadataStr);
    } catch (error) {
      return c.json({ error: "Invalid metadata format" }, 400);
    }

    // Validate audio files can only have one translation
    if (type === "audio" && metadata.translations) {
      const translationCount = Object.keys(metadata.translations).length;
      if (translationCount !== 1) {
        return c.json(
          {
            error: "Audio files must have exactly one translation",
            details: `Found ${translationCount} translations, but audio files require exactly 1`,
          },
          400
        );
      }
    }

    const originalName = uploadedFile.originalname;
    const isImage = IMAGE_CONFIG.acceptedMimeTypes.includes(
      uploadedFile.mimetype
    );

    let fileUrl: string;
    let thumbnailUrl: string | undefined;

    try {
      console.log(`Starting file processing for ${originalName}`);
      const timestamp = Date.now();

      if (isImage) {
        console.log("Processing image file");
        const optimizedBuffer = await optimizeImage(uploadedFile.buffer);
        const storagePath = `project-${projectId}/images/${timestamp}-${originalName}`;

        console.log(`Uploading optimized image to ${storagePath}`);
        fileUrl = await storage.saveFile(optimizedBuffer, storagePath);
        console.log(`Image uploaded successfully: ${fileUrl}`);

        try {
          console.log("Generating thumbnail");
          thumbnailUrl = await generateThumbnail(
            uploadedFile.buffer,
            originalName,
            projectId,
            timestamp
          );
          console.log(`Thumbnail generated: ${thumbnailUrl}`);
        } catch (thumbnailError) {
          console.error("Thumbnail generation failed:", thumbnailError);
        }
      } else {
        console.log("Processing audio file");
        const storagePath = `project-${projectId}/audio/${timestamp}-${originalName}`;

        console.log(`Uploading file to ${storagePath}`);
        fileUrl = await storage.saveFile(uploadedFile.buffer, storagePath);
        console.log(`File uploaded successfully: ${fileUrl}`);
      }

      console.log("Starting database transaction");
      const result = await db.transaction(async (trx) => {
        console.log("Inserting file record");
        const [savedFile] = await trx
          .insert(files)
          .values({
            projectId,
            name: originalName,
            type: type,
            path: fileUrl,
            thumbnailPath: isImage ? thumbnailUrl : undefined,
          })
          .returning();

        if (!savedFile) {
          throw new Error("Failed to save file");
        }

        if (metadata.translations) {
          console.log("Processing translations");
          const translationPromises = Object.entries(metadata.translations).map(
            async ([locale, translation]) => {
              const [language] = await trx
                .select()
                .from(languages)
                .where(
                  and(
                    eq(languages.locale, locale),
                    eq(languages.projectId, projectId)
                  )
                );

              if (!language) {
                throw new Error(`Language not found for locale ${locale}`);
              }

              return trx.insert(file_translations).values({
                fileId: savedFile.id,
                languageId: language.id,
                title: translation.title,
                description: translation.description,
              });
            }
          );

          await Promise.all(translationPromises);
          console.log("Translations processed successfully");
        }

        return savedFile;
      });

      console.log("File upload process completed successfully");
      return c.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error processing file:", error);
      return c.json(
        {
          error: "File processing failed",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  } catch (error) {
    console.error("Error in file upload:", error);
    return c.json(
      {
        error: "Failed to process and save file",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});
