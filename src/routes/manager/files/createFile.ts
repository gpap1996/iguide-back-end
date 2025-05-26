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
import { storage, FILE_LIMITS } from "../../../utils/fileStorage";

interface Translation {
  title: string;
  description: string;
}

interface Metadata {
  translations?: Record<string, Translation>;
}

export const createFile = new Hono().post("/", requiresManager, async (c) => {
  const currentUser = c.get("currentUser");
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

  try {
    const formData = await c.req.formData();
    const uploadedFile = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;
    const metadataStr = formData.get("metadata") as string | null;

    // Validations for the form data
    if (!uploadedFile) {
      return c.json(
        {
          error: "No file provided",
          details: "File is required. Upload a file to continue.",
        },
        400
      );
    }

    if (!type) {
      return c.json(
        {
          error: "No type provided",
          details: "Type is required. Select a file type to continue.",
        },
        400
      );
    }

    if (!metadataStr) {
      return c.json(
        {
          error: "No metadata provided",
          details: "Metadata is required. Add metadata to continue.",
        },
        400
      );
    }

    if (type === "audio") {
      if (!FILE_LIMITS.ALLOWED_AUDIO_TYPES.includes(uploadedFile.type)) {
        return c.json(
          {
            error: "Invalid audio format",
            details: `Only MP3 files are supported. Received: ${uploadedFile.type}`,
          },
          400
        );
      }
    } else if (type === "image") {
      if (!FILE_LIMITS.ALLOWED_IMAGE_TYPES.includes(uploadedFile.type)) {
        return c.json(
          {
            error: "Invalid image format",
            details: `File type ${
              uploadedFile.type
            } is not allowed. Allowed types: ${FILE_LIMITS.ALLOWED_IMAGE_TYPES.join(
              ", "
            )}`,
          },
          400
        );
      }
    }

    let metadata: Metadata;
    try {
      metadata = JSON.parse(metadataStr);
    } catch (error) {
      return c.json(
        {
          error: "Invalid metadata format",
          details: "Metadata must be a valid JSON object",
        },
        400
      );
    }

    if (type === "audio" && metadata.translations) {
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

    // Validation end

    // Convert File to buffer
    const arrayBuffer = await uploadedFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const originalName = uploadedFile.name;
    const isImage = IMAGE_CONFIG.acceptedMimeTypes.includes(uploadedFile.type);

    let fileUrl: string;
    let thumbnailUrl: string | undefined;

    try {
      console.log(`Starting file processing for ${originalName}`);
      const timestamp = Date.now();

      if (isImage) {
        const optimizedBuffer = await optimizeImage(buffer);
        const storagePath = `project-${projectId}/images/${timestamp}-${originalName}`;

        console.log(`Uploading optimized image to ${storagePath}`);
        fileUrl = await storage.saveFile(optimizedBuffer, storagePath);
        console.log(`Image uploaded successfully: ${fileUrl}`);

        try {
          console.log("Generating thumbnail");
          thumbnailUrl = await generateThumbnail(
            buffer,
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
        fileUrl = await storage.saveFile(buffer, storagePath);
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
