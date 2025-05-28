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

export const updateArea = new Hono().put(
  "/:id",
  requiresManager,
  zValidator("json", schema),
  async (c) => {
    const areaData = c.req.valid("json");
    const areaId = parseInt(c.req.param("id"), 10);
    const currentUser = c.get("currentUser");

    if (isNaN(areaId)) {
      return c.json({ error: "Invalid area ID" }, 400);
    }

    if (!currentUser?.projectId) {
      return c.json({ error: "Project ID not found for current user" }, 400);
    }
    const projectId = Number(currentUser.projectId);

    try {
      const result = await db.transaction(async (trx): Promise<any> => {
        // 1. Check if area exists and belongs to the project
        const [existingArea] = await trx
          .select()
          .from(areas)
          .where(and(eq(areas.id, areaId), eq(areas.projectId, projectId)));

        if (!existingArea) {
          throw new Error("Area not found or access denied");
        }

        // 2. Update the area in the areas table
        const [updatedArea] = await trx
          .update(areas)
          .set({
            weight: areaData?.weight,
            parentId: areaData?.parentId,
            updatedAt: new Date(),
          })
          .where(eq(areas.id, areaId))
          .returning();

        // 3. Handle translations update
        if (areaData.translations) {
          // Delete existing translations
          await trx
            .delete(area_translations)
            .where(eq(area_translations.areaId, areaId));

          // Insert new translations
          const translationPromises = Object.entries(areaData.translations).map(
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
                throw new Error(`Language not found for locale ${locale}`);
              }

              return trx.insert(area_translations).values({
                areaId: updatedArea.id,
                languageId: language.id,
                title: translation.title,
                subtitle: translation.subtitle,
                description: translation.description,
              });
            }
          );

          await Promise.all(translationPromises);
        }

        // 4. Handle file associations update (both images and audio)
        if (
          (areaData.images && areaData.images.length > 0) ||
          (areaData.audio && areaData.audio.length > 0)
        ) {
          // Delete existing file associations
          await trx.delete(area_files).where(eq(area_files.areaId, areaId));
          await trx
            .delete(area_external_files)
            .where(eq(area_external_files.areaId, areaId));

          // Handle image files
          if (areaData.images && areaData.images.length > 0) {
            const imagePromises = areaData.images.map(async (fileId) => {
              const [foundFile] = await trx
                .select({
                  id: files.id,
                })
                .from(files)
                .where(eq(files.id, fileId));

              if (!foundFile) {
                throw new Error(`Image file not found for id: ${fileId}`);
              }

              return trx.insert(area_files).values({
                areaId: updatedArea.id,
                fileId: foundFile.id,
              });
            });
            await Promise.all(imagePromises);
          }

          // Handle audio files
          if (areaData.audio && areaData.audio.length > 0) {
            const audioPromises = areaData.audio.map(async (fileId) => {
              const [foundFile] = await trx
                .select({
                  id: files.id,
                })
                .from(files)
                .where(eq(files.id, fileId));

              if (!foundFile) {
                throw new Error(`Audio file not found for id: ${fileId}`);
              }

              return trx.insert(area_files).values({
                areaId: updatedArea.id,
                fileId: foundFile.id,
              });
            });
            await Promise.all(audioPromises);
          }

          // Handle video files
          if (areaData.videos && areaData.videos.length > 0) {
            const videoPromises = areaData.videos.map(async (fileId) => {
              const [foundFile] = await trx
                .select({
                  id: external_files.id,
                })
                .from(external_files)
                .where(eq(external_files.id, fileId));

              if (!foundFile) {
                throw new Error(`Video file not found for id: ${fileId}`);
              }

              return trx.insert(area_external_files).values({
                areaId: updatedArea.id,
                externalFileId: foundFile.id,
              });
            });
            await Promise.all(videoPromises);
          }

          // Handle model files
          if (areaData.models && areaData.models.length > 0) {
            const modelPromises = areaData.models.map(async (fileId) => {
              const [foundFile] = await trx
                .select({
                  id: external_files.id,
                })
                .from(external_files)
                .where(eq(external_files.id, fileId));

              if (!foundFile) {
                throw new Error(`Model file not found for id: ${fileId}`);
              }

              return trx.insert(area_external_files).values({
                areaId: updatedArea.id,
                externalFileId: foundFile.id,
              });
            });
            await Promise.all(modelPromises);
          }
        }

        return updatedArea;
      });

      return c.json({
        success: true,
        data: result,
      });
    } catch (error) {
      return c.json(
        {
          error: "Failed to update area",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }
);
