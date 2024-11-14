import { Hono } from "hono";
import fs from "fs";
import { requiresAdmin } from "../../middleware/requiresAdmin";
import path from "path";
import { db } from "../../db/database";
import {
  optimizeImage,
  generateThumbnail,
} from "../../utils/imageOptimization";

interface MediaMetadata {
  type?: string;
  fileIndex?: number;
  translations?: {
    [locale: string]: {
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
    [locale: string]: {
      title?: string | null;
      description?: string | null;
    };
  };
}

export const updateMedia = new Hono().patch(
  "/:id",
  requiresAdmin,
  async (c) => {
    const mediaId = c.req.param("id");
    const body = await c.req.formData();
    const file = body.get("file");
    const type = body.get("type")?.toString();
    const metadataStr = body.get("metadata");

    // First, fetch the existing media record
    const existingMedia = await db
      .selectFrom("media")
      .where("id", "=", mediaId)
      .selectAll()
      .executeTakeFirst();

    if (!existingMedia) {
      return c.json({ error: "Media not found" }, 404);
    }

    let metadata: MediaMetadata = {};
    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr as string);
      } catch (error) {
        return c.json({ error: "Invalid metadata format" }, 400);
      }
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
      // Handle file update if new file is provided
      if (file instanceof File) {
        const originalName = file.name;
        const extension = path.extname(originalName);
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(7);
        const generatedFileName = `${timestamp}-${randomString}${extension}`;

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Process images
        const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(originalName);
        let finalBuffer = buffer;
        let thumbnailUrl = existingMedia.thumbnail_url;

        if (isImage) {
          finalBuffer = await optimizeImage(buffer);
          thumbnailUrl = await generateThumbnail(buffer, originalName);
        }

        const filePath = path.join(uploadDir, generatedFileName);
        const newUrl = `/media/${generatedFileName}`;

        // Write new file
        fs.writeFileSync(filePath, finalBuffer);

        // Delete old file
        const oldFilePath = path.join(".", existingMedia.url);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }

        // Delete old thumbnail if it exists
        if (existingMedia.thumbnail_url) {
          const oldThumbnailPath = path.join(".", existingMedia.thumbnail_url);
          if (fs.existsSync(oldThumbnailPath)) {
            fs.unlinkSync(oldThumbnailPath);
          }
        }

        // Update database with new file information
        await db
          .updateTable("media")
          .set({
            url: newUrl,
            thumbnail_url: thumbnailUrl,
          })
          .where("id", "=", mediaId)
          .execute();

        updateResult.url = newUrl;
        updateResult.thumbnail_url = thumbnailUrl;
        updateResult.originalName = originalName;
        updateResult.size = finalBuffer.length;
      }

      // Update type if provided
      if (type) {
        await db
          .updateTable("media")
          .set({
            type: type,
          })
          .where("id", "=", mediaId)
          .execute();

        updateResult.type = type;
      }

      // Update translations if provided
      if (metadata.translations) {
        await saveTranslations(mediaId, metadata.translations);
        updateResult.translations = metadata.translations;
      }

      updateResult.success = true;
    } catch (error) {
      console.error("Error updating media:", error);
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
  }
);

// Function to save translations to the database
async function saveTranslations(
  mediaId: string,
  translations: MediaMetadata["translations"]
) {
  if (!translations) return;

  const translationValues = await Promise.all(
    Object.entries(translations).map(async ([locale, fields]) => {
      // Fetch the language_id for the given locale
      const language = await db
        .selectFrom("languages")
        .where("locale", "=", locale)
        .select("id")
        .executeTakeFirst();

      if (!language) {
        console.error(`Language with locale ${locale} not found.`);
        return [];
      }

      const languageId = language.id;

      return Object.entries(fields)
        .filter(([_, value]) => value !== undefined)
        .map(([field, value]) => ({
          entity_type: "media",
          entity_id: mediaId,
          language_id: languageId, // Use language_id instead of locale
          field,
          field_value: value ?? "",
        }));
    })
  );

  // Flatten the array of translation values
  const flattenedTranslationValues = translationValues.flat();

  if (flattenedTranslationValues.length > 0) {
    await db.transaction().execute(async (trx) => {
      // First delete any existing translations for this media
      await trx
        .deleteFrom("translations")
        .where("entity_type", "=", "media")
        .where("entity_id", "=", mediaId)
        .execute();

      // Then insert the new translations
      await trx
        .insertInto("translations")
        .values(flattenedTranslationValues)
        .execute();
    });
  }
}
