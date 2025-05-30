import { Hono } from "hono";
import { db } from "../../../db";
import { requiresManager } from "../../../middleware/requiresManager";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  areas,
  languages,
  area_translations,
  files,
  area_files,
  external_files,
  area_external_files,
} from "../../../db/schema";
import { and, eq } from "drizzle-orm";

const schema = z.object({
  parentId: z.number().optional(),
  weight: z.number().optional(),
  images: z.array(z.number()).optional(),
  audio: z.array(z.number()).optional(),
  videos: z.array(z.number()).optional(),
  models: z.array(z.number()).optional(),
  translations: z
    .record(
      z.string(), // Language code as the key
      z.object({
        title: z.string().optional(),
        subtitle: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .optional(),
});

export const createArea = new Hono().post(
  "/",
  requiresManager,
  zValidator("json", schema),
  async (c) => {
    const area = c.req.valid("json");
    const currentUser = c.get("currentUser");
    if (!currentUser?.projectId) {
      return c.json({ error: "Project ID not found for current user" }, 400);
    }
    const projectId = Number(currentUser.projectId);

    try {
      const result = await db.transaction(async (trx): Promise<any> => {
        // 1.Insert the area into the areas table

        const [insertedArea] = await trx
          .insert(areas)
          .values({ projectId, weight: area?.weight, parentId: area?.parentId })
          .returning();

        // 2.Insert the translations into the area_translations table
        if (area.translations) {
          const translationPromises = Object.entries(area.translations).map(
            async ([locale, translation]) => {
              const [language] = await trx
                .select({ id: languages.id })
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

              return trx.insert(area_translations).values({
                areaId: insertedArea.id,
                languageId: language.id,
                title: translation.title,
                subtitle: translation.subtitle,
                description: translation.description,
              });
            }
          );

          await Promise.all(translationPromises);
        }

        // 3. Handle image files
        if (area.images && area.images.length > 0) {
          const filesPromises = area.images.map(async (fileId) => {
            const [foundFile] = await db
              .select({
                id: files.id,
              })
              .from(files)
              .where(eq(files.id, fileId));

            if (!foundFile) {
              throw new Error(`Image file not found for id: ${fileId}`);
            }

            return trx.insert(area_files).values({
              areaId: insertedArea.id,
              fileId: foundFile.id,
            });
          });
          await Promise.all(filesPromises);
        }

        // 4. Handle audio files
        if (area.audio && area.audio.length > 0) {
          const audioPromises = area.audio.map(async (fileId) => {
            const [foundFile] = await db
              .select({
                id: files.id,
              })
              .from(files)
              .where(eq(files.id, fileId));

            if (!foundFile) {
              throw new Error(`Audio file not found for id: ${fileId}`);
            }

            return trx.insert(area_files).values({
              areaId: insertedArea.id,
              fileId: foundFile.id,
            });
          });
          await Promise.all(audioPromises);
        }

        // 5. Handle videos
        if (area.videos && area.videos.length > 0) {
          const videoPromises = area.videos.map(async (fileId) => {
            const [foundFile] = await db
              .select({
                id: external_files.id,
              })
              .from(external_files)
              .where(eq(external_files.id, fileId));

            if (!foundFile) {
              throw new Error(`External file not found for id: ${fileId}`);
            }

            return trx.insert(area_external_files).values({
              areaId: insertedArea.id,
              externalFileId: foundFile.id,
            });
          });
          await Promise.all(videoPromises);
        }

        // 6. Handle models
        if (area.models && area.models.length > 0) {
          const modelPromises = area.models.map(async (fileId) => {
            const [foundFile] = await db
              .select({
                id: external_files.id,
              })
              .from(external_files)
              .where(eq(external_files.id, fileId));

            if (!foundFile) {
              throw new Error(`External file not found for id: ${fileId}`);
            }

            return trx.insert(area_external_files).values({
              areaId: insertedArea.id,
              externalFileId: foundFile.id,
            });
          });
          await Promise.all(modelPromises);
        }
      });

      return c.json({
        success: true,
        data: result,
      });
    } catch (error) {
      return c.json({
        error: "Failed to create area",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);
