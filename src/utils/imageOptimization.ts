import sharp from "sharp";
import path from "path";
import { storage, FILE_LIMITS } from "./fileStorage";

export const IMAGE_CONFIG = {
  maxWidth: 1200,
  jpegQuality: 70,
  thumbnailWidth: 100,
  // Use the same list as FILE_LIMITS
  acceptedMimeTypes: FILE_LIMITS.ALLOWED_IMAGE_TYPES,
};

// Interface for image optimization options
export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: "jpeg" | "png" | "webp";
}

// Default optimization options
const DEFAULT_OPTIONS: ImageOptimizationOptions = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 80,
  format: "jpeg",
};

/**
 * Optimizes an image from a buffer and returns optimized buffer
 */
export async function optimizeImage(
  buffer: Buffer,
  options: ImageOptimizationOptions = {}
): Promise<Buffer> {
  try {
    // Check if it's an SVG file - return as is without optimization
    const isSvg = buffer.toString().includes("<svg");
    if (isSvg) {
      return buffer;
    }

    // Merge default options with provided options
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

    // Create sharp instance
    let sharpInstance = sharp(buffer);

    // Resize if dimensions are provided
    if (mergedOptions.maxWidth || mergedOptions.maxHeight) {
      sharpInstance = sharpInstance.resize({
        width: mergedOptions.maxWidth,
        height: mergedOptions.maxHeight,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    // Convert to specified format
    switch (mergedOptions.format) {
      case "jpeg":
        sharpInstance = sharpInstance.jpeg({
          quality: mergedOptions.quality,
          progressive: true,
        });
        break;
      case "png":
        sharpInstance = sharpInstance.png({
          quality: mergedOptions.quality,
          progressive: true,
        });
        break;
      case "webp":
        sharpInstance = sharpInstance.webp({
          quality: mergedOptions.quality,
        });
        break;
    }

    // Process the image
    const optimizedBuffer = await sharpInstance.toBuffer();

    // Check if the optimized file size is within limits
    if (optimizedBuffer.length > FILE_LIMITS.MAX_FILE_SIZE) {
      throw new Error(
        `Optimized image size (${optimizedBuffer.length} bytes) exceeds maximum allowed size (${FILE_LIMITS.MAX_FILE_SIZE} bytes)`
      );
    }

    return optimizedBuffer;
  } catch (error) {
    console.error("Error optimizing image:", error);
    throw new Error(
      `Failed to optimize image: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Generates a thumbnail from an image stream or buffer and uploads to storage
 * Returns the public URL of the thumbnail
 */
export async function generateThumbnail(
  source: Buffer,
  originalName: string,
  projectId: number,
  timestamp?: number
): Promise<string> {
  const extension = path.extname(originalName).toLowerCase();

  // For SVG files, return the original file path as the thumbnail
  if (extension === ".svg") {
    const fileTimestamp = timestamp || Date.now();
    const storagePath = `project-${projectId}/images/${fileTimestamp}-${originalName}`;
    return storagePath; // Return the original file path for SVGs
  }

  const baseName = path.basename(originalName, extension);
  const fileTimestamp = timestamp || Date.now();
  const thumbnailName = `thumb_${fileTimestamp}_${baseName}${extension}`;
  const thumbnailStoragePath = `project-${projectId}/images/thumbnails/${thumbnailName}`;

  try {
    console.log("Starting thumbnail generation");

    console.log("Processing thumbnail from buffer");
    const thumbnailBuffer = await sharp(source)
      .resize({
        width: IMAGE_CONFIG.thumbnailWidth,
        fit: "contain",
      })
      .jpeg({
        quality: 70,
        progressive: true,
        force: false,
      })
      .withMetadata()
      .toBuffer();
    console.log(
      `Thumbnail generation complete, size: ${thumbnailBuffer.length} bytes`
    );

    console.log("Uploading thumbnail to storage");
    const thumbnailUrl = await storage.saveFile(
      thumbnailBuffer,
      thumbnailStoragePath
    );
    console.log("Thumbnail upload complete");

    return thumbnailUrl;
  } catch (error) {
    console.error("Error generating thumbnail:", error);
    throw new Error(`Failed to generate thumbnail: ${error.message}`);
  }
}
