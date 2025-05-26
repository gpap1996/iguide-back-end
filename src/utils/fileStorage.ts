// File storage configuration
// This module provides an abstraction for file storage that can be switched between
// cloud storage providers like Firebase Storage or AWS S3

import path from "path";
import { bucket } from "./firebaseAdmin"; // Import bucket from firebaseAdmin

// Constants for file limits
export const FILE_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_TOTAL_SIZE: 100 * 1024 * 1024, // 100MB per batch
  MAX_FILES_PER_BATCH: 50,
  ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  ALLOWED_AUDIO_TYPES: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/m4a"],
};

// Interface for storage provider
export interface StorageProvider {
  saveFile(fileBuffer: Buffer, filePath: string): Promise<string>;
  getFileUrl(filePath: string): string;
  deleteFile(filePath: string): Promise<void>;
}

// Firebase Storage implementation
export class FirebaseStorage implements StorageProvider {
  private bucketName: string;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second
  private readonly UPLOAD_TIMEOUT = 30000; // 30 seconds

  constructor(bucketName = "") {
    this.bucketName = bucketName;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    retries: number = this.MAX_RETRIES
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (attempt < retries) {
          console.log(`Retry attempt ${attempt} of ${retries}`);
          await this.delay(this.RETRY_DELAY * attempt);
        }
      }
    }

    throw lastError || new Error("Operation failed after all retries");
  }

  async saveFile(fileBuffer: Buffer, filePath: string): Promise<string> {
    try {
      const file = bucket.file(filePath);
      const contentType = this.getContentType(filePath);

      // Create a timeout promise
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Upload timed out after ${this.UPLOAD_TIMEOUT}ms`));
        }, this.UPLOAD_TIMEOUT);
      });

      const uploadPromise = new Promise<string>(async (resolve, reject) => {
        try {
          // For smaller files, use direct upload
          console.log(
            `Using direct upload for file (${fileBuffer.length} bytes)`
          );
          await this.retryOperation(async () => {
            await file.save(fileBuffer, {
              contentType,
              public: true,
              resumable: false,
              metadata: {
                cacheControl: "public, max-age=31536000", // 1 year cache
              },
            });
          });

          await file.makePublic();
          // Return just the file path instead of the full URL
          resolve(filePath);
        } catch (error) {
          reject(error);
        }
      });

      // Race between upload and timeout
      return (await Promise.race([uploadPromise, timeoutPromise])) as string;
    } catch (error) {
      console.error(
        `Error uploading to Firebase Storage for ${filePath}:`,
        error
      );
      throw new Error(
        `Failed to upload file to Firebase Storage: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  getFileUrl(filePath: string): string {
    return `https://firebasestorage.googleapis.com/v0/b/${
      bucket.name
    }/o/${encodeURIComponent(filePath)}?alt=media`;
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      console.log(`Deleting file with path: ${filePath}`);
      const file = bucket.file(filePath);
      const [exists] = await file.exists();

      if (exists) {
        await file.delete();
        console.log(`Successfully deleted file: ${filePath}`);
      } else {
        console.log(`File does not exist: ${filePath}`);
      }
    } catch (error) {
      console.error("Error deleting file from Firebase Storage:", error);
      throw error;
    }
  }

  private getContentType(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();

    const contentTypeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
      ".m4a": "audio/mp4",
    };

    return contentTypeMap[extension] || "application/octet-stream";
  }
}

// AWS S3 implementation can be added here in the future
// export class S3Storage implements StorageProvider { ... }

// Export default storage provider (use Firebase Storage)
export const storage = new FirebaseStorage();

// Helper function to generate a unique filename
export function generateUniqueFilename(originalFilename: string): string {
  const extension = path.extname(originalFilename);
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(7);
  return `${timestamp}-${randomString}${extension}`;
}
