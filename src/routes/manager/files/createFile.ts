import { Hono } from "hono";
import fs from "fs";
import { requiresManager } from "../../../middleware/requiresManager";
import path from "path";
import { db } from "../../../db";
import { files } from "../../../db/schema/files";
import { file_translations } from "../../../db/schema/file_translations";
import { languages } from "../../../db/schema/languages";

import {
  optimizeImage,
  generateThumbnail,
} from "../../../utils/imageOptimization";
import { and, eq } from "drizzle-orm";

interface Translation {
  title: string;
  description: string;
}

interface Metadata {
  translations: {
    [key: string]: Translation;
  };
}

// Create files endpoint
export const createFile = new Hono().post("/", requiresManager, async (c) => {
  const currentUser = c.get("currentUser");
  const body = await c.req.formData();
  const file = body.get("file");
  const type = body.get("type")?.toString();
  const metadataStr = body.get("metadata");

  if (!currentUser?.projectId) {
    return c.json({ error: "Project ID not found for current user" }, 400);
  }

  const projectId = Number(currentUser.projectId);

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

  const uploadDir = `./files/project-${projectId}`;

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
  let thumbnailPath: string | undefined = "";

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
      thumbnailPath = await generateThumbnail(buffer, originalName, projectId);
    }

    const filePath = path.join(uploadDir, generatedFileName);
    const url = `/files/project-${projectId}/${generatedFileName}`;

    fs.writeFileSync(filePath, finalBuffer);

    const result = await db.transaction(async (trx) => {
      // Insert files record
      const [savedFile] = await trx
        .insert(files)
        .values({
          projectId,
          name: originalName,
          type: type,
          path: url,
          thumbnailPath: isImage ? thumbnailPath : undefined,
        })
        .returning();

      if (!savedFile) {
        throw new Error("Failed to save file");
      }

      // Insert translations
      if (metadata.translations) {
        const translationPromises = Object.entries(metadata.translations).map(
          async ([locale, translation]) => {
            // Get language_id from locale
            const [language] = await trx
              .select()
              .from(languages)
              .where(
                and(
                  eq(languages.locale, locale),
                  eq(languages.projectId, projectId)
                )
              );

            if (!language) {
              return c.json(
                {
                  success: false,
                  message: `Language not found for locale ${locale}`,
                },
                404
              );
            }

            // Insert translation
            return trx.insert(file_translations).values({
              projectId,
              fileId: savedFile.id,
              languageId: language.id,
              title: translation.title,
              description: translation.description,
            });
          }
        );

        await Promise.all(translationPromises);
      }

      return savedFile;
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
    if (thumbnailPath) {
      const filePath = path.join(uploadDir, thumbnailPath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    return c.json({
      error: "Failed to process and save file",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
