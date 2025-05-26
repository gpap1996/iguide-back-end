import { Hono } from "hono";
import { db } from "../../../db";
import { files } from "../../../db/schema/files";
import { requiresManager } from "../../../middleware/requiresManager";
import {
  optimizeImage,
  generateThumbnail,
  IMAGE_CONFIG,
} from "../../../utils/imageOptimization";
import { UploadedFile } from "../../../utils/fileUpload";
import pLimit from "p-limit";
import { storage } from "../../../utils/fileStorage";
import { FILE_LIMITS } from "../../../utils/fileStorage";

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Helper function to delay execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper function to retry an operation
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  delayMs: number = RETRY_DELAY
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        await delay(delayMs);
        delayMs *= 2;
      }
    }
  }

  throw lastError || new Error("Operation failed after all retries");
}

// Create multiple files endpoint
export const createFiles = new Hono().post("/", requiresManager, async (c) => {
  try {
    const currentUser = c.get("currentUser");

    if (!currentUser?.projectId) {
      return c.json({ error: "Project ID not found for current user" }, 400);
    }

    const projectId = Number(currentUser.projectId);

    // Use Hono's built-in form data parsing
    const formData = await c.req.formData();
    const fileList = formData.getAll("files") as File[];
    const type = formData.get("type") as string | null;

    if (!fileList || fileList.length === 0) {
      return c.json({ error: "No files provided" }, 400);
    }

    if (!type) {
      return c.json({ error: "No type provided" }, 400);
    }

    if (type !== "image" && type !== "audio") {
      return c.json(
        { error: "Invalid file type. Only 'image' and 'audio' are allowed" },
        400
      );
    }

    const allowedMimeTypes =
      type === "image"
        ? FILE_LIMITS.ALLOWED_IMAGE_TYPES
        : FILE_LIMITS.ALLOWED_AUDIO_TYPES;

    const validFiles: UploadedFile[] = [];
    const errors = [];

    // Convert Files to UploadedFile format and validate
    for (const file of fileList) {
      if (!allowedMimeTypes.includes(file.type)) {
        errors.push({
          name: file.name,
          error:
            type === "audio"
              ? "Only MP3 files are supported"
              : `Invalid ${type} format. File type ${
                  file.type
                } is not allowed. Allowed types: ${allowedMimeTypes.join(
                  ", "
                )}`,
        });
        continue;
      }

      // Convert File to UploadedFile format
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      validFiles.push({
        fieldname: "files",
        originalname: file.name,
        encoding: "7bit",
        mimetype: file.type,
        buffer,
        size: buffer.length,
      });
    }

    if (validFiles.length === 0) {
      return c.json(
        {
          error: "No valid files to process",
          details: errors,
        },
        400
      );
    }

    const concurrencyLimit = pLimit(1);
    const fileProcessingPromises = validFiles.map((file) =>
      concurrencyLimit(async () => {
        try {
          const originalName = file.originalname;
          let fileUrl: string;
          let thumbnailUrl: string | undefined;

          const timestamp = Date.now();
          const storagePath =
            type === "image"
              ? `project-${projectId}/images/${timestamp}-${originalName}`
              : `project-${projectId}/audio/${timestamp}-${originalName}`;

          if (type === "image") {
            console.log("Optimizing image before upload");
            const optimizedBuffer = await optimizeImage(file.buffer);
            fileUrl = await retryOperation(async () => {
              return await storage.saveFile(optimizedBuffer, storagePath);
            });

            try {
              thumbnailUrl = await retryOperation(async () => {
                return await generateThumbnail(
                  file.buffer,
                  originalName,
                  projectId,
                  timestamp
                );
              });
            } catch (error) {
              console.error("Thumbnail generation failed:", error);
            }
          } else {
            fileUrl = await retryOperation(async () => {
              return await storage.saveFile(file.buffer, storagePath);
            });
          }

          const [savedFile] = await retryOperation(async () => {
            return await db
              .insert(files)
              .values({
                projectId,
                name: originalName,
                type: type,
                path: fileUrl,
                thumbnailPath: type === "image" ? thumbnailUrl : undefined,
              })
              .returning();
          });

          return savedFile;
        } catch (error) {
          throw new Error(
            `Error processing ${file.originalname}: ${error.message}`
          );
        }
      })
    );

    const results = [];
    for (const promise of fileProcessingPromises) {
      try {
        const result = await promise;
        results.push(result);
      } catch (error) {
        errors.push({
          name:
            error.toString().split(":")[0].replace("Error processing ", "") ||
            "Unknown file",
          error: error.message || "Failed to process file",
        });
      }
    }

    return c.json({
      success: true,
      data: results,
      errors: errors.length > 0 ? errors : undefined,
      total: {
        processed: results.length,
        failed: errors.length,
      },
    });
  } catch (error) {
    console.error("Error in mass file upload:", error);
    return c.json(
      {
        error: "Failed to process files",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});
