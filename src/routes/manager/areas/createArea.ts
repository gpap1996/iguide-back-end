import { Hono } from "hono";
import { db } from "@/db";
import { requiresAdmin } from "@/middleware/requiresAdmin";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  areas,
  languages,
  area_translations,
  files,
  area_files,
} from "@/db/schema";
import { eq } from "drizzle-orm";

const schema = z.object({
  parentId: z.number().optional(),
  weight: z.number().optional(),
  images: z.array(z.number()).optional(),
  sound: z.string().optional(),
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
  requiresAdmin,
  zValidator("json", schema),
  async (c) => {
    const area = c.req.valid("json");

    try {
      const result = await db.transaction(async (trx): Promise<any> => {
        // 1.Insert the area into the areas table

        const [insertedArea] = await trx
          .insert(areas)
          .values({ weight: area?.weight, parentId: area?.parentId })
          .returning();

        // 2.Insert the translations into the area_translations table
        if (area.translations) {
          const translationPromises = Object.entries(area.translations).map(
            async ([locale, translation]) => {
              const [language] = await trx
                .select({ id: languages.id })
                .from(languages)
                .where(eq(languages.locale, locale));

              if (!language) {
                return c.json(
                  {
                    success: false,
                    message: `Language not found for locale ${locale}`,
                  },
                  404
                );
              }

              return trx
                .insert(area_translations)
                .values({
                  areaId: insertedArea.id,
                  languageId: language.id,
                  title: translation.title,
                  subtitle: translation.subtitle,
                  description: translation.description,
                })
                .execute();
            }
          );

          await Promise.all(translationPromises);
        }

        if (area.images && area.images.length > 0) {
          const filesPromises = area.images.map(async (fileId) => {
            const [foundFile] = await db
              .select({
                id: files.id,
              })
              .from(files)
              .where(eq(files.id, fileId));

            if (!foundFile) {
              throw new Error(`File not found for id: ${fileId}`);
            }

            return trx
              .insert(area_files)
              .values({
                areaId: insertedArea.id,
                fileId: foundFile.id,
              })
              .execute();
          });
          await Promise.all(filesPromises);
        }
      });

      return c.json({
        success: true,
        data: result,
      });
    } catch (error) {
      return c.json({
        error: "Failed to create file",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);
