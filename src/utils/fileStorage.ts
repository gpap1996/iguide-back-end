// File storage configuration
// This module provides an abstraction for file storage that can be switched between
// local filesystem and cloud storage providers like Firebase Storage or AWS S3

import fs from "fs-extra";
import path from "path";
import { bucket } from "./firebaseAdmin"; // Import bucket from firebaseAdmin

// Constants for file limits
export const FILE_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_TOTAL_SIZE: 100 * 1024 * 1024, // 100MB per batch
  MAX_FILES_PER_BATCH: 50,
  ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  ALLOWED_AUDIO_TYPES: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/m4a"],
  MAX_IMAGE_DIMENSION: 4096, // 4K resolution
  THUMBNAIL_SIZE: 300, // 300px for thumbnails
};

// Interface for storage provider
export interface StorageProvider {
  saveFile(
    fileBuffer: Buffer | NodeJS.ReadableStream,
    filePath: string
  ): Promise<string>;

  getFileUrl(filePath: string): string;

  deleteFile(filePath: string): Promise<void>;
}

// Local filesystem implementation
export class LocalFileStorage implements StorageProvider {
  private baseDir: string;
  private baseUrl: string;

  constructor(baseDir: string = "./files", baseUrl: string = "/files") {
    this.baseDir = baseDir;
    this.baseUrl = baseUrl;
  }

  async saveFile(
    fileBuffer: Buffer | NodeJS.ReadableStream,
    filePath: string
  ): Promise<string> {
    const fullPath = path.join(this.baseDir, filePath);

    // Ensure the directory exists
    await fs.ensureDir(path.dirname(fullPath));

    if (Buffer.isBuffer(fileBuffer)) {
      // Write buffer to file
      await fs.writeFile(fullPath, fileBuffer);
    } else {
      // Create write stream for the file
      const writeStream = fs.createWriteStream(fullPath);

      // Pipe readable stream to write stream
      await new Promise<void>((resolve, reject) => {
        fileBuffer.pipe(writeStream);
        writeStream.on("finish", () => resolve());
        writeStream.on("error", (err) => reject(err));
      });
    }

    // Return the URL path
    return `${this.baseUrl}/${filePath}`;
  }

  getFileUrl(filePath: string): string {
    return `${this.baseUrl}/${filePath}`;
  }

  async deleteFile(filePath: string): Promise<void> {
    const fullPath = path.join(this.baseDir, filePath);

    // Check if file exists before deleting
    if (await fs.pathExists(fullPath)) {
      await fs.unlink(fullPath);
    }
  }
}

// Firebase Storage implementation
export class FirebaseStorage implements StorageProvider {
  private bucketName: string;
  private readonly CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
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

  async saveFile(
    fileBuffer: Buffer | NodeJS.ReadableStream,
    filePath: string
  ): Promise<string> {
    try {
      // Check file size if it's a buffer
      if (Buffer.isBuffer(fileBuffer)) {
        if (fileBuffer.length > FILE_LIMITS.MAX_FILE_SIZE) {
          throw new Error(
            `File size exceeds maximum limit of ${
              FILE_LIMITS.MAX_FILE_SIZE / (1024 * 1024)
            }MB`
          );
        }
      }

      const file = bucket.file(filePath);
      const contentType = this.getContentType(filePath);

      // Validate content type
      if (
        ![
          ...FILE_LIMITS.ALLOWED_IMAGE_TYPES,
          ...FILE_LIMITS.ALLOWED_AUDIO_TYPES,
        ].includes(contentType)
      ) {
        throw new Error(
          `File type ${contentType} is not allowed. Allowed types are: ${[
            ...FILE_LIMITS.ALLOWED_IMAGE_TYPES,
            ...FILE_LIMITS.ALLOWED_AUDIO_TYPES,
          ].join(", ")}`
        );
      }

      // Add timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Upload timed out after ${
                this.UPLOAD_TIMEOUT / 1000
              } seconds for ${filePath}`
            )
          );
        }, this.UPLOAD_TIMEOUT);
      });

      // Create upload promise
      const uploadPromise = new Promise<string>(async (resolve, reject) => {
        try {
          if (Buffer.isBuffer(fileBuffer)) {
            // For buffers, use chunked upload if size is large
            if (fileBuffer.length > this.CHUNK_SIZE) {
              console.log(
                `Using chunked upload for large file (${fileBuffer.length} bytes)`
              );
              await this.retryOperation(async () => {
                const uploadStream = file.createWriteStream({
                  contentType,
                  resumable: true,
                  public: true,
                  timeout: this.UPLOAD_TIMEOUT,
                  metadata: {
                    cacheControl: "public, max-age=31536000", // 1 year cache
                  },
                });

                // Split buffer into chunks and upload
                for (let i = 0; i < fileBuffer.length; i += this.CHUNK_SIZE) {
                  const chunk = fileBuffer.slice(i, i + this.CHUNK_SIZE);
                  await new Promise<void>((resolveChunk, rejectChunk) => {
                    uploadStream.write(chunk, (err) => {
                      if (err) rejectChunk(err);
                      else resolveChunk();
                    });
                  });
                }

                await new Promise<void>((resolveEnd, rejectEnd) => {
                  uploadStream.end((error: Error | null) => {
                    if (error) rejectEnd(error);
                    else resolveEnd();
                  });
                });
              });
            } else {
              // For smaller files, use direct upload
              console.log(
                `Using direct upload for small file (${fileBuffer.length} bytes)`
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
            }
          } else {
            // For streams, use resumable upload
            console.log("Using stream upload");
            await this.retryOperation(async () => {
              await new Promise<void>((resolveStream, rejectStream) => {
                const uploadStream = file.createWriteStream({
                  contentType,
                  resumable: true,
                  public: true,
                  timeout: this.UPLOAD_TIMEOUT,
                  metadata: {
                    cacheControl: "public, max-age=31536000", // 1 year cache
                  },
                });

                uploadStream.on("error", (err: Error) => {
                  rejectStream(err);
                });

                uploadStream.on("finish", () => {
                  resolveStream();
                });

                if (typeof (fileBuffer as any).pipe === "function") {
                  (fileBuffer as any).pipe(uploadStream);
                  (fileBuffer as any).on("error", (err: Error) => {
                    rejectStream(err);
                  });
                } else {
                  (async () => {
                    try {
                      const chunks: Buffer[] = [];
                      for await (const chunk of fileBuffer) {
                        chunks.push(
                          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
                        );
                      }
                      const buffer = Buffer.concat(chunks);
                      uploadStream.end(buffer);
                    } catch (err) {
                      rejectStream(err);
                    }
                  })();
                }
              });
            });
          }

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
