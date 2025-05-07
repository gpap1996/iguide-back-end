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

export const updateMedia = new Hono().put("/:id", requiresAdmin, async (c) => {
  const mediaId = c.req.param("id");
  if (!mediaId) {
    return c.json({ error: "Invalid media ID" }, 400);
  }

  const body = await c.req.formData();
  const file = body.get("file");
  const type = body.get("type")?.toString();
  const metadataStr = body.get("metadata");

  // Check if media exists
  const existingMedia = await db
    .selectFrom("media")
    .select(["url", "thumbnail_url"])
    .where("id", "=", mediaId)
    .executeTakeFirst();

  if (!existingMedia) {
    return c.json({ error: "Media not found" }, 404);
  }

  let metadata: Metadata | undefined;
  if (metadataStr) {
    try {
      metadata = JSON.parse(metadataStr as string);
    } catch (error) {
      return c.json({ error: "Invalid metadata format" }, 400);
    }
  }

  const uploadDir = "./media";
  let newUrl: string | undefined;
  let newThumbnailUrl: string | undefined;
  let oldFilePath: string | undefined;
  let oldThumbnailPath: string | undefined;

  try {
    // Handle file update if provided
    if (file && file instanceof File) {
      const originalName = file.name;
      const extension = path.extname(originalName);
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(7);
      const newFileName = `${timestamp}-${randomString}${extension}`;

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Only process images
      const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(originalName);
      let finalBuffer = buffer;

      if (isImage) {
        finalBuffer = await optimizeImage(buffer);
        newThumbnailUrl = await generateThumbnail(buffer, originalName);
      }

      const newFilePath = path.join(uploadDir, newFileName);
      newUrl = `/media/${newFileName}`;

      fs.writeFileSync(newFilePath, finalBuffer);

      // Store old file paths for cleanup
      if (existingMedia.url) {
        oldFilePath = path.join(uploadDir, path.basename(existingMedia.url));
      }
      if (existingMedia.thumbnail_url) {
        oldThumbnailPath = path.join(
          uploadDir,
          path.basename(existingMedia.thumbnail_url)
        );
      }
    }

    const result = await db.transaction().execute(async (trx) => {
      // Update media record
      const updateValues: any = {};
      if (type) updateValues.type = type;
      if (newUrl) updateValues.url = newUrl;
      if (newThumbnailUrl) updateValues.thumbnail_url = newThumbnailUrl;

      const updatedMedia = await trx
        .updateTable("media")
        .set(updateValues)
        .where("id", "=", mediaId)
        .returning([
          "id",
          "type",
          "url",
          "thumbnail_url",
          "created_at",
          "updated_at",
        ])
        .executeTakeFirst();

      if (!updatedMedia) {
        throw new Error("Failed to update media");
      }

      // Update translations if provided
      if (metadata?.translations) {
        // Delete existing translations
        await trx
          .deleteFrom("media_translations")
          .where("media_id", "=", mediaId)
          .execute();

        // Insert new translations
        const translationPromises = Object.entries(metadata.translations).map(
          async ([locale, translation]) => {
            const language = await trx
              .selectFrom("languages")
              .select("id")
              .where("locale", "=", locale)
              .executeTakeFirst();

            if (!language) {
              throw new Error(`Language not found for locale: ${locale}`);
            }

            return trx
              .insertInto("media_translations")
              .values({
                media_id: mediaId,
                language_id: language.id,
                title: translation.title,
                description: translation.description,
              })
              .execute();
          }
        );

        await Promise.all(translationPromises);
      }

      return updatedMedia;
    });

    // Clean up old files after successful transaction
    if (oldFilePath && fs.existsSync(oldFilePath)) {
      fs.unlinkSync(oldFilePath);
    }
    if (oldThumbnailPath && fs.existsSync(oldThumbnailPath)) {
      fs.unlinkSync(oldThumbnailPath);
    }

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error updating media:", error);

    // Clean up new file if transaction failed
    if (newUrl) {
      const newFilePath = path.join(uploadDir, path.basename(newUrl));
      if (fs.existsSync(newFilePath)) {
        fs.unlinkSync(newFilePath);
      }
    }

    return c.json({
      error: "Failed to update media",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
