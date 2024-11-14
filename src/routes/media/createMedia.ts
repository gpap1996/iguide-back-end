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
  type: string;
  fileIndex: number;
  translations?: {
    [locale: string]: {
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
    [locale: string]: {
      title?: string | null;
      description?: string | null;
    };
  };
}

// Create media endpoint
export const createMedia = new Hono().post("/", requiresAdmin, async (c) => {
  const body = await c.req.formData();
  const file = body.get("file");
  const type = body.get("type")?.toString();
  const metadataStr = body.get("metadata");

  if (!file) {
    return c.json({ error: "No file provided" }, 400);
  }

  if (!type) {
    return c.json({ error: "No type provided" }, 400);
  }

  if (!metadataStr) {
    return c.json({ error: "No metadata provided" }, 400);
  }

  let metadata: MediaMetadata;
  try {
    metadata = JSON.parse(metadataStr as string);
  } catch (error) {
    return c.json({ error: "Invalid metadata format" }, 400);
  }

  const uploadResults: UploadResult[] = [];
  const uploadDir = "./media";

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  if (!(file instanceof File)) {
    return c.json(
      {
        error: "The file provided is invalid",
      },
      400
    );
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
        type: type,
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
    if (metadata.translations && savedMedia.id) {
      await saveTranslations(savedMedia.id, metadata.translations);
    }

    uploadResults.push({
      success: true,
      id: savedMedia.id,
      type: savedMedia.type,
      url: savedMedia.url,
      thumbnail_url: savedMedia.thumbnail_url,
      originalName: originalName,
      size: finalBuffer.length,
      translations: metadata.translations,
    });
  } catch (error) {
    console.error("Error processing file:", error);

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
      type: type,
      url: "",
      thumbnail_url: "",
      originalName: file.name,
      size: file.size,
    });
  }

  return c.json({
    success: uploadResults.some((result) => result.success),
    totalFiles: uploadResults.length,
    files: uploadResults,
  });
});

// Modified function to save translations
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
