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
import { parseMultipartForm } from "../../../utils/streamUpload";
import { storage } from "../../../utils/fileStorage";

interface Translation {
  title: string;
  description: string;
}

interface Metadata {
  translations: {
    [key: string]: Translation;
  };
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
    const { files: uploadedFiles, fields } = await parseMultipartForm(c, {
      projectId,
      processBuffered: true,
      maxConcurrency: 1,
      maxFileSize: 50 * 1024 * 1024,
    });

    console.log("Multipart form parsed successfully");
    const type = fields.type;
    const metadataStr = fields.metadata;

    if (uploadedFiles.length === 0) {
      return c.json({ error: "No file provided" }, 400);
    }

    const uploadedFile = uploadedFiles[0];
    console.log(`Processing file: ${uploadedFile.filename}`);

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

    const originalName = uploadedFile.filename;
    const isImage = IMAGE_CONFIG.acceptedMimeTypes.includes(
      uploadedFile.mimetype
    );

    let fileUrl: string;
    let thumbnailUrl: string | undefined;

    try {
      console.log(`Starting file processing for ${originalName}`);
      if (isImage && uploadedFile.fileBuffer) {
        console.log("Processing image file");
        const optimizedBuffer = await optimizeImage(uploadedFile.fileBuffer);
        const timestamp = Date.now();
        const storagePath = `project-${projectId}/file-${timestamp}-${originalName}`;

        console.log(`Uploading optimized image to ${storagePath}`);
        fileUrl = await storage.saveFile(optimizedBuffer, storagePath);
        console.log(`Image uploaded successfully: ${fileUrl}`);

        try {
          console.log("Generating thumbnail");
          thumbnailUrl = await generateThumbnail(
            uploadedFile.fileBuffer,
            originalName,
            projectId
          );
          console.log(`Thumbnail generated: ${thumbnailUrl}`);
        } catch (thumbnailError) {
          console.error("Thumbnail generation failed:", thumbnailError);
        }
      } else {
        console.log("Processing non-image file");
        const timestamp = Date.now();
        const storagePath = `project-${projectId}/file-${timestamp}-${originalName}`;
        const source = uploadedFile.fileBuffer || uploadedFile.fileStream;

        if (!source) {
          throw new Error("No file data available for upload");
        }

        console.log(`Uploading file to ${storagePath}`);
        fileUrl = await storage.saveFile(source, storagePath);
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
