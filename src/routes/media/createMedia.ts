import { Hono } from "hono";
import fs from "fs";
import { requiresAdmin } from "../../middleware/requiresAdmin";
import path from "path";
import { db } from "../../db/schema";
import {
  optimizeImage,
  generateThumbnail,
} from "../../utils/imageOptimization";

interface Translation {
  title: string;
  description: string;
}

interface Metadata {
  translations: {
    [key: string]: Translation;
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

  let metadata: Metadata;
  try {
    metadata = JSON.parse(metadataStr as string);
  } catch (error) {
    return c.json({ error: "Invalid metadata format" }, 400);
  }

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

  let generatedFileName: string | undefined = "";
  let thumbnailUrl: string | undefined = "";

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

    const result = await db.transaction().execute(async (trx) => {
      // Insert media record
      const savedMedia = await trx
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
        throw new Error("Failed to save media");
      }

      // Insert translations
      if (metadata.translations) {
        const translationPromises = Object.entries(metadata.translations).map(
          async ([locale, translation]) => {
            // Get language_id from locale
            const language = await trx
              .selectFrom("languages")
              .select("id")
              .where("locale", "=", locale)
              .executeTakeFirst();

            if (!language) {
              throw new Error(`Language not found for locale: ${locale}`);
            }

            // Insert translation
            return trx
              .insertInto("media_translations")
              .values({
                media_id: savedMedia.id,
                language_id: language.id,
                title: translation.title,
                description: translation.description,
              })
              .execute();
          }
        );

        await Promise.all(translationPromises);
      }

      return savedMedia;
    });

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error processing file:", error);

    // Remove the uploaded file if it exists
    if (generatedFileName) {
      const filePath = path.join(uploadDir, generatedFileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Remove the thumbnail if it exists
    if (thumbnailUrl) {
      const filePath = path.join(uploadDir, thumbnailUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    return c.json({
      error: "Failed to process and save media",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
