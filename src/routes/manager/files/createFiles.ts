import { Hono } from "hono";
import { db } from "../../../db";
import { files } from "../../../db/schema/files";
import { requiresManager } from "../../../middleware/requiresManager";
import {
  optimizeImage,
  generateThumbnail,
  IMAGE_CONFIG,
} from "../../../utils/imageOptimization";
import {
  parseMultipartForm,
  processUploadedFiles,
  UploadedFile,
} from "../../../utils/streamUpload";
import pLimit from "p-limit";
import { storage } from "../../../utils/fileStorage";

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

    const { files: uploadedFiles, fields } = await parseMultipartForm(c, {
      projectId,
      processBuffered: true,
      maxConcurrency: 1,
      maxFileSize: 50 * 1024 * 1024,
    });

    const type = fields.type;

    if (!uploadedFiles || uploadedFiles.length === 0) {
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
        ? IMAGE_CONFIG.acceptedMimeTypes
        : ["audio/mp3", "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"];

    const validFiles: UploadedFile[] = [];
    const errors = [];

    for (const file of uploadedFiles) {
      if (!allowedMimeTypes.includes(file.mimetype)) {
        errors.push({
          name: file.filename,
          error: `Invalid ${type} format. File type ${file.mimetype} is not allowed.`,
        });
        continue;
      }
      validFiles.push(file);
    }

    const concurrencyLimit = pLimit(1);
    const fileProcessingPromises = validFiles.map((file) =>
      concurrencyLimit(async () => {
        try {
          const originalName = file.filename;
          let fileUrl: string;
          let thumbnailUrl: string | undefined;

          if (!file.fileBuffer && !file.fileStream) {
            throw new Error("No file data available");
          }

          const timestamp = Date.now();
          const storagePath = `project-${projectId}/file-${timestamp}-${originalName}`;
          const source = file.fileBuffer || file.fileStream;

          fileUrl = await retryOperation(async () => {
            if (type === "image" && file.fileBuffer) {
              console.log("Optimizing image before upload");
              const optimizedBuffer = await optimizeImage(file.fileBuffer);
              return await storage.saveFile(optimizedBuffer, storagePath);
            }
            return await storage.saveFile(source, storagePath);
          });

          if (type === "image" && file.fileBuffer) {
            try {
              const buffer = file.fileBuffer;
              if (!buffer) {
                throw new Error(
                  "No file buffer available for thumbnail generation"
                );
              }
              thumbnailUrl = await retryOperation(async () => {
                return await generateThumbnail(buffer, originalName, projectId);
              });
            } catch (error) {
              console.error("Thumbnail generation failed:", error);
            }
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
            `Error processing ${file.filename}: ${error.message}`
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
