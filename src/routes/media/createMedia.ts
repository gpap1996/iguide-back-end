import { Hono } from "hono";
import fs from "fs";
import { requiresAdmin } from "../../middleware/requiresAdmin";
import path from "path";
import { db } from "../../db/database";
import sharp from "sharp";

interface MediaMetadata {
  type: string;
  fileIndex: number;
  translations?: {
    [language_id: string]: {
      // Changed from locale to language_id
      title?: string | null;
      description?: string | null;
    };
  };
}

interface UploadResult {
  success: boolean;
  id?: string;
  type: string;
  url: string;
  thumbnail_url?: string;
  originalName: string;
  size: number;
  translations?: {
    [language_id: string]: {
      // Changed from locale to language_id
      title?: string | null;
      description?: string | null;
    };
  };
}

// Image optimization configuration remains the same
const IMAGE_CONFIG = {
  maxWidth: 1200,
  jpegQuality: 80,
  thumbnailWidth: 100,
};

// Existing image optimization functions remain the same
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

async function saveTranslations(
  mediaId: string,
  translations: MediaMetadata["translations"]
) {
  if (!translations) return;

  const translationValues = Object.entries(translations).flatMap(
    ([language_id, fields]) =>
      Object.entries(fields)
        .filter(([_, value]) => value !== undefined)
        .map(([field, value]) => ({
          entity_type: "media",
          entity_id: mediaId,
          language_id, // Using language_id instead of locale
          field,
          field_value: value ?? "",
        }))
  );

  if (translationValues.length > 0) {
    await db.transaction().execute(async (trx) => {
      // First delete any existing translations for this media
      await trx
        .deleteFrom("translations")
        .where("entity_type", "=", "media")
        .where("entity_id", "=", mediaId)
        .execute();

      // Then insert the new translations
      await trx.insertInto("translations").values(translationValues).execute();
    });
  }
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
          type: meta.type,
          url,
          thumbnail_url: isImage ? thumbnailUrl : undefined,
        })
        .returning([
          "id",
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

      // Save translations if they exist
      if (meta.translations && savedMedia.id) {
        await saveTranslations(savedMedia.id, meta.translations);
      }

      uploadResults.push({
        success: true,
        id: savedMedia.id,
        type: savedMedia.type,
        url: savedMedia.url,
        thumbnail_url: savedMedia.thumbnail_url,
        originalName: originalName,
        size: finalBuffer.length,
        translations: meta.translations,
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
