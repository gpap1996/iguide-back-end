import { Hono } from "hono";
import fs from "fs";
import { requiresAdmin } from "../../middleware/requiresAdmin";
import path from "path";
import { db } from "../../db/database";
import sharp from "sharp";

interface MediaMetadata {
  title?: string;
  type: string;
  description?: string;
  fileIndex: number;
}

interface UploadResult {
  success: boolean;
  id?: string;
  title: string;
  description?: string;
  type: string;
  url: string;
  thumbnail_url?: string;
  originalName: string;
  size: number;
}

// Image optimization configuration
const IMAGE_CONFIG = {
  maxWidth: 1200, // Maximum width for any image
  jpegQuality: 80, // JPEG quality (0-100)
  thumbnailWidth: 100, // Thumbnail width
};

async function optimizeImage(buffer: Buffer): Promise<Buffer> {
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

async function generateThumbnail(
  buffer: Buffer,
  originalName: string
): Promise<string> {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(7);
  const extension = path.extname(originalName);
  const thumbnailFileName = `thumb-${timestamp}-${randomString}${extension}`;
  const thumbnailPath = path.join("./media", thumbnailFileName);

  await sharp(buffer)
    .resize({
      width: IMAGE_CONFIG.thumbnailWidth,
      fit: "contain",
    })
    .jpeg({ quality: 70 })
    .toFile(thumbnailPath);

  return `/media/${thumbnailFileName}`;
}

export const createMedia = new Hono().post("/", requiresAdmin, async (c) => {
  const body = await c.req.formData();
  const files = body.getAll("files");
  const metadataStr = body.get("metadata");

  if (!files || files.length === 0) {
    return c.json({ error: "No files provided" }, 400);
  }

  if (!metadataStr) {
    return c.json({ error: "No metadata provided" }, 400);
  }

  let metadata: MediaMetadata[];
  try {
    metadata = JSON.parse(metadataStr as string);
  } catch (error) {
    return c.json({ error: "Invalid metadata format" }, 400);
  }

  if (!Array.isArray(metadata)) {
    return c.json({ error: "Metadata must be an array" }, 400);
  }

  const isValidMetadata = metadata.every(
    (item) =>
      typeof item.type === "string" &&
      typeof item.fileIndex === "number" &&
      item.fileIndex >= 0 &&
      item.fileIndex < files.length
  );

  if (!isValidMetadata) {
    return c.json(
      {
        error:
          "Invalid metadata structure. Each item must have type and valid fileIndex",
      },
      400
    );
  }

  const uploadResults: UploadResult[] = [];
  const uploadDir = "./media";

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  for (const meta of metadata) {
    const file = files[meta.fileIndex];

    if (!(file instanceof File)) {
      continue;
    }

    let generatedFileName = "";
    let thumbnailUrl = "";

    try {
      const originalName = file.name;
      const extension = path.extname(originalName);
      const nameWithoutExt = path.basename(originalName, extension);
      const title = meta.title?.trim() || nameWithoutExt;

      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(7);
      generatedFileName = `${timestamp}-${randomString}${extension}`;

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Only process images
      const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(originalName);
      let finalBuffer = buffer;

      if (isImage) {
        finalBuffer = await optimizeImage(buffer);
        thumbnailUrl = await generateThumbnail(buffer, originalName);
      }

      const filePath = path.join(uploadDir, generatedFileName);
      const url = `/media/${generatedFileName}`;

      fs.writeFileSync(filePath, finalBuffer);

      const savedMedia = await db
        .insertInto("media")
        .values({
          title,
          description: meta.description?.trim(),
          type: meta.type,
          url,
          thumbnail_url: isImage ? thumbnailUrl : null,
        })
        .returning([
          "id",
          "title",
          "description",
          "type",
          "url",
          "thumbnail_url",
          "created_at",
          "updated_at",
        ])
        .executeTakeFirst();

      if (!savedMedia) {
        throw new Error("Failed to save media to database");
      }

      uploadResults.push({
        success: true,
        id: savedMedia.id,
        title: savedMedia.title,
        description: savedMedia.description || undefined,
        type: savedMedia.type,
        url: savedMedia.url,
        thumbnail_url: savedMedia.thumbnail_url,
        originalName: originalName,
        size: finalBuffer.length,
      });
    } catch (error) {
      console.error("Error processing file:", error);

      // Clean up main file
      if (generatedFileName) {
        const filePath = path.join(uploadDir, generatedFileName);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (cleanupError) {
            console.error(
              "Error cleaning up file after failed upload:",
              cleanupError
            );
          }
        }
      }

      // Clean up thumbnail if it exists
      if (thumbnailUrl) {
        const thumbnailPath = path.join(".", thumbnailUrl);
        if (fs.existsSync(thumbnailPath)) {
          try {
            fs.unlinkSync(thumbnailPath);
          } catch (cleanupError) {
            console.error(
              "Error cleaning up thumbnail after failed upload:",
              cleanupError
            );
          }
        }
      }

      uploadResults.push({
        success: false,
        id: "",
        title: file.name,
        type: meta.type,
        url: "",
        thumbnail_url: "",
        originalName: file.name,
        size: file.size,
      });
    }
  }

  return c.json({
    success: uploadResults.some((result) => result.success),
    totalFiles: uploadResults.length,
    files: uploadResults,
  });
});
