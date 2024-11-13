import { Hono } from "hono";
import fs from "fs";
import { requiresAdmin } from "../../middleware/requiresAdmin";
import path from "path";
import { db } from "../../db/database";
import sharp from "sharp";

interface MediaUpdateMetadata {
  id: string;
  type?: string;
  fileIndex?: number;
  translations?: {
    [language_id: string]: {
      title?: string | null;
      description?: string | null;
    };
  };
}

interface UpdateResult {
  success: boolean;
  id: string;
  type: string;
  url: string;
  thumbnail_url?: string;
  originalName?: string;
  size?: number;
  translations?: {
    [language_id: string]: {
      title?: string | null;
      description?: string | null;
    };
  };
}
interface TranslationField {
  title?: string | null;
  description?: string | null;
}

interface TranslationsMap {
  [language_id: string]: TranslationField;
}

interface MediaMetadata {
  type: string;
  fileIndex: number;
  translations?: TranslationsMap;
}

interface TranslationRecord {
  entity_type: string;
  entity_id: string;
  language_id: string;
  field: string;
  field_value: string;
}

// Image optimization configuration remains the same
const IMAGE_CONFIG = {
  maxWidth: 1200,
  jpegQuality: 80,
  thumbnailWidth: 100,
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

async function saveTranslations(
  mediaId: string,
  translations: TranslationsMap | undefined
) {
  if (!translations) return;

  const translationValues = Object.entries(translations).flatMap(
    ([language_id, fields]) =>
      Object.entries(fields)
        .filter(([_, value]) => value !== undefined)
        .map(
          ([field, value]): TranslationRecord => ({
            entity_type: "media",
            entity_id: mediaId,
            language_id,
            field,
            field_value: value ?? "",
          })
        )
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

export const updateMedia = new Hono().put("/:id", requiresAdmin, async (c) => {
  const mediaId = c.req.param("id");
  const body = await c.req.formData();
  const files = body.getAll("files");
  const metadataStr = body.get("metadata");

  // First, verify that the media exists
  const existingMedia = await db
    .selectFrom("media")
    .where("id", "=", mediaId)
    .select(["id", "type", "url", "thumbnail_url"])
    .executeTakeFirst();

  if (!existingMedia) {
    return c.json({ error: "Media not found" }, 404);
  }

  let metadata: MediaUpdateMetadata;
  try {
    metadata = metadataStr
      ? JSON.parse(metadataStr as string)
      : { id: mediaId };
  } catch (error) {
    return c.json({ error: "Invalid metadata format" }, 400);
  }

  if (metadata.id !== mediaId) {
    return c.json({ error: "Metadata ID does not match URL parameter" }, 400);
  }

  const uploadDir = "./media";
  let updateResult: UpdateResult = {
    success: false,
    id: mediaId,
    type: existingMedia.type,
    url: existingMedia.url,
    thumbnail_url: existingMedia.thumbnail_url,
  };

  try {
    // Handle file update if a new file is provided
    if (files.length > 0 && metadata.fileIndex !== undefined) {
      const file = files[metadata.fileIndex];

      if (file instanceof File) {
        // Clean up old files
        if (existingMedia.url) {
          const oldFilePath = path.join(".", existingMedia.url);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
        if (existingMedia.thumbnail_url) {
          const oldThumbnailPath = path.join(".", existingMedia.thumbnail_url);
          if (fs.existsSync(oldThumbnailPath)) {
            fs.unlinkSync(oldThumbnailPath);
          }
        }

        // Process and save new file
        const originalName = file.name;
        const extension = path.extname(originalName);
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(7);
        const generatedFileName = `${timestamp}-${randomString}${extension}`;

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(originalName);
        let finalBuffer = buffer;
        let thumbnailUrl = "";

        if (isImage) {
          finalBuffer = await optimizeImage(buffer);
          thumbnailUrl = await generateThumbnail(buffer, originalName);
        }

        const filePath = path.join(uploadDir, generatedFileName);
        const url = `/media/${generatedFileName}`;

        fs.writeFileSync(filePath, finalBuffer);

        // Update database with new file information
        await db
          .updateTable("media")
          .set({
            url,
            thumbnail_url: isImage ? thumbnailUrl : undefined,
            type: metadata.type || existingMedia.type,
          })
          .where("id", "=", mediaId)
          .execute();

        updateResult = {
          ...updateResult,
          type: metadata.type || existingMedia.type,
          url,
          thumbnail_url: thumbnailUrl || undefined,
          originalName,
          size: finalBuffer.length,
        };
      }
    } else if (metadata.type) {
      // Update only metadata if no new file is provided
      await db
        .updateTable("media")
        .set({
          type: metadata.type,
        })
        .where("id", "=", mediaId)
        .execute();

      updateResult.type = metadata.type;
    }

    // Handle translations update if provided
    if (metadata.translations) {
      await saveTranslations(mediaId, metadata.translations);
      updateResult.translations = metadata.translations;
    }

    updateResult.success = true;
  } catch (error) {
    console.error("Error updating media:", error);

    // Clean up new files if update failed
    if (updateResult.url !== existingMedia.url) {
      const newFilePath = path.join(".", updateResult.url);
      if (fs.existsSync(newFilePath)) {
        fs.unlinkSync(newFilePath);
      }
    }
    if (
      updateResult.thumbnail_url &&
      updateResult.thumbnail_url !== existingMedia.thumbnail_url
    ) {
      const newThumbnailPath = path.join(".", updateResult.thumbnail_url);
      if (fs.existsSync(newThumbnailPath)) {
        fs.unlinkSync(newThumbnailPath);
      }
    }

    return c.json(
      {
        success: false,
        error: "Failed to update media",
      },
      500
    );
  }

  return c.json({
    success: true,
    file: updateResult,
  });
});
