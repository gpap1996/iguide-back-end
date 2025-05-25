import sharp from "sharp";
import path from "path";
import { Readable } from "stream";
import { storage, generateUniqueFilename } from "./fileStorage";

export const IMAGE_CONFIG = {
  maxWidth: 1200,
  jpegQuality: 70,
  thumbnailWidth: 100,
  // Accepted image formats
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
};

/**
 * Optimizes an image either from a buffer or a stream and returns optimized buffer
 */
export async function optimizeImage(
  source: Buffer | Readable
): Promise<Buffer> {
  try {
    console.log("Starting image optimization");

    // Create a transform stream for progressive processing
    const transform = sharp()
      .on("error", (err) => {
        console.error("Sharp processing error:", err);
      })
      .resize({
        width: IMAGE_CONFIG.maxWidth,
        withoutEnlargement: true,
        fit: "inside",
      })
      .jpeg({
        quality: IMAGE_CONFIG.jpegQuality,
        mozjpeg: true,
        progressive: true,
        force: false,
      })
      .withMetadata();

    if (Buffer.isBuffer(source)) {
      console.log(`Processing buffer input, size: ${source.length} bytes`);

      // Get image info
      const info = await sharp(source).metadata();
      console.log(`Original image info: ${JSON.stringify(info)}`);

      // Convert buffer to stream for processing
      const bufferStream = new Readable();
      bufferStream.push(source);
      bufferStream.push(null);

      // Process using streaming pipeline
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const pipeline = bufferStream.pipe(transform);

        pipeline.on("data", (chunk) => {
          console.log(`Processing chunk of size: ${chunk.length} bytes`);
          chunks.push(chunk);
        });

        pipeline.on("end", () => {
          const result = Buffer.concat(chunks);
          console.log(
            `Image optimization complete, output size: ${result.length} bytes`
          );
          resolve(result);
        });

        pipeline.on("error", (err) => {
          console.error("Pipeline error:", err);
          reject(err);
        });

        // Add timeout
        const timeout = setTimeout(() => {
          pipeline.destroy();
          reject(new Error("Image optimization timed out after 30 seconds"));
        }, 30000);

        pipeline.on("end", () => {
          clearTimeout(timeout);
        });
      });
    } else {
      console.log("Processing stream input");
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const pipeline = source.pipe(transform);

        pipeline.on("data", (chunk) => {
          console.log(`Processing chunk of size: ${chunk.length} bytes`);
          chunks.push(chunk);
        });

        pipeline.on("end", () => {
          const result = Buffer.concat(chunks);
          console.log(
            `Stream processing complete, output size: ${result.length} bytes`
          );
          resolve(result);
        });

        pipeline.on("error", (err) => {
          console.error("Pipeline error:", err);
          reject(err);
        });

        // Add timeout
        const timeout = setTimeout(() => {
          pipeline.destroy();
          reject(new Error("Image optimization timed out after 30 seconds"));
        }, 30000);

        pipeline.on("end", () => {
          clearTimeout(timeout);
        });
      });
    }
  } catch (error) {
    console.error("Error in image optimization:", error);
    throw new Error(`Failed to optimize image: ${error.message}`);
  }
}

/**
 * Generates a thumbnail from an image stream or buffer and uploads to storage
 * Returns the public URL of the thumbnail
 */
export async function generateThumbnail(
  source: Buffer | Readable,
  originalName: string,
  projectId: number
): Promise<string> {
  const extension = path.extname(originalName);
  const thumbnailFileName = `thumb-${generateUniqueFilename(originalName)}`;
  const thumbnailStoragePath = `project-${projectId}/${thumbnailFileName}`;

  try {
    console.log("Starting thumbnail generation");

    // Create a transform stream for thumbnail
    const transform = sharp()
      .on("error", (err) => {
        console.error("Sharp thumbnail error:", err);
      })
      .resize({
        width: IMAGE_CONFIG.thumbnailWidth,
        fit: "contain",
      })
      .jpeg({
        quality: 70,
        progressive: true,
        force: false,
      })
      .withMetadata();

    // Process using streaming pipeline
    const thumbnailBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let inputStream: Readable;

      if (Buffer.isBuffer(source)) {
        console.log("Processing thumbnail from buffer");
        inputStream = new Readable();
        inputStream.push(source);
        inputStream.push(null);
      } else {
        console.log("Processing thumbnail from stream");
        inputStream = source;
      }

      const pipeline = inputStream.pipe(transform);

      pipeline.on("data", (chunk) => {
        console.log(
          `Processing thumbnail chunk of size: ${chunk.length} bytes`
        );
        chunks.push(chunk);
      });

      pipeline.on("end", () => {
        const result = Buffer.concat(chunks);
        console.log(
          `Thumbnail generation complete, size: ${result.length} bytes`
        );
        resolve(result);
      });

      pipeline.on("error", (err) => {
        console.error("Thumbnail pipeline error:", err);
        reject(err);
      });

      // Add timeout
      const timeout = setTimeout(() => {
        pipeline.destroy();
        reject(new Error("Thumbnail generation timed out after 15 seconds"));
      }, 15000);

      pipeline.on("end", () => {
        clearTimeout(timeout);
      });
    });

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

/**
 * Legacy buffer-based optimization for backward compatibility
 */
export async function optimizeImageBuffer(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize({
      width: IMAGE_CONFIG.maxWidth,
      withoutEnlargement: true,
      fit: "inside",
    })
    .jpeg({
      quality: IMAGE_CONFIG.jpegQuality,
      mozjpeg: true,
    })
    .toBuffer();
}
