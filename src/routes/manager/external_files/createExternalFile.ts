import { Hono } from "hono";
import { requiresManager } from "src/middleware/requiresManager";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "src/db";
import {
  external_file_translations,
  external_files,
  languages,
} from "src/db/schema";
import { eq } from "drizzle-orm";

const createExternalFileSchema = z.object({
  name: z.string({ required_error: "Name is required" }),
  type: z.enum(["model", "video"], { required_error: "Type is required" }),
  url: z.string({ required_error: "URL is required" }),
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

export const createExternalFile = new Hono().post(
  "/",
  requiresManager,
  zValidator("json", createExternalFileSchema),
  async (c) => {
    const externalFile = c.req.valid("json");
    const currentUser = c.get("currentUser");
    const projectId = Number(currentUser.projectId);

    if (!projectId) {
      return c.json(
        {
          error: "Project ID not found for current user",
          details: "Project ID is required to create an external file",
        },
        400
      );
    }

    const { type, url, translations, name } = externalFile;

    try {
      const result = await db.transaction(async (trx) => {
        // 1. Insert the external file into the external_files table
        const [createdFile] = await trx
          .insert(external_files)
          .values({
            name,
            url,
            type,
            projectId,
          })
          .returning();

        if (!createdFile) {
          throw new Error("Failed to create external file");
        }

        if (translations) {
          const translationPromises = Object.entries(translations).map(
            async ([locale, translation]) => {
              const [language] = await trx
                .select()
                .from(languages)
                .where(eq(languages.locale, locale));

              if (!language) {
                return c.json(
                  {
                    error: "Language not found",
                    details: `Language not found for locale ${locale}`,
                  },
                  404
                );
              }

              return trx.insert(external_file_translations).values({
                externalFileId: createdFile.id,
                languageId: language.id,
                title: translation.title,
                description: translation.description,
              });
            }
          );
          await Promise.all(translationPromises);
        }

        return createdFile;
      });

      return c.json(
        {
          message: "External file created successfully",
          externalFile: result,
        },
        201
      );
    } catch (error) {
      return c.json(
        {
          error: "Failed to create external file",
          details: error,
        },
        500
      );
    }
  }
);
