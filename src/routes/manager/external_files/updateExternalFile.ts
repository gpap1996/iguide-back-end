import { Hono } from "hono";
import { requiresManager } from "src/middleware/requiresManager";
import { db } from "src/db";
import {
  external_files,
  external_file_translations,
  languages,
} from "src/db/schema";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";

const updateExternalFileSchema = z.object({
  type: z.enum(["model", "video"], { required_error: "Type is required" }),
  url: z.string({ required_error: "URL is required" }).url(),
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

export const updateExternalFile = new Hono().put(
  "/:id",
  requiresManager,
  zValidator("json", updateExternalFileSchema),
  async (c) => {
    const externalFileId = parseInt(c.req.param("id"));
    const externalFile = c.req.valid("json");
    const currentUser = c.get("currentUser");
    const projectId = Number(currentUser.projectId);

    if (isNaN(externalFileId)) {
      return c.json(
        {
          error: "Invalid external file ID",
          details: "Please contact support if this issue persists.",
        },
        400
      );
    }

    if (!projectId) {
      return c.json(
        {
          error: "Project ID not found for current user",
          details: "Please contact support if this issue persists.",
        },
        400
      );
    }

    try {
      const result = await db.transaction(async (trx) => {
        const [existingExternalFile] = await trx
          .select()
          .from(external_files)
          .where(eq(external_files.id, externalFileId));

        if (!existingExternalFile) {
          throw new Error("External file not found or access denied");
        }

        // Update the external file in the external_files table
        const [updatedExternalFile] = await trx
          .update(external_files)
          .set(externalFile)
          .where(eq(external_files.id, externalFileId))
          .returning();

        // Update the translations in the external_file_translations table
        if (externalFile.translations) {
          // Delete existing translations
          await trx
            .delete(external_file_translations)
            .where(
              eq(external_file_translations.externalFileId, externalFileId)
            );

          // Insert new translations
          const translationPromises = Object.entries(
            externalFile.translations
          ).map(async ([locale, translation]) => {
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

            return trx.insert(external_file_translations).values({
              externalFileId: updatedExternalFile.id,
              languageId: language.id,
              title: translation.title,
              description: translation.description,
            });
          });
          await Promise.all(translationPromises);
        }

        return updatedExternalFile;
      });

      return c.json(
        {
          message: "External file updated successfully",
          externalFile: result,
        },
        200
      );
    } catch (error) {
      return c.json({
        error: "Failed to update external file",
        details: error,
      });
    }
  }
);
