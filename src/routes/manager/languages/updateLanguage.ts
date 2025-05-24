import { Hono } from "hono";
import { db } from "@/db";
import { languages } from "@/db/schema/languages";
import { requiresManager } from "@/middleware/requiresManager";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";

const schema = z.object({
  name: z.string({ required_error: "Language name is required" }),
  locale: z.string({ required_error: "Language code is required" }),
});

export const updateLanguage = new Hono().put(
  "/:id",
  requiresManager,
  zValidator("json", schema),
  async (c) => {
    const newLanguage = c.req.valid("json");
    const id = parseInt(c.req.param("id"));

    try {
      // Start transaction
      await db.transaction(async (trx) => {
        // Step 1: Fetch the language (locale) from the `languages` table by ID
        const existingLanguage = await trx
          .select()
          .from(languages)
          .where(eq(languages.id, id));

        if (!existingLanguage) {
          return c.json({ success: false, message: "Language not found" }, 404);
        }

        // Step 2: Update the `languages` table with the new language data
        await trx
          .update(languages)
          .set(newLanguage)
          .where(eq(languages.id, id));
      });

      return c.json({
        success: true,
        message: "Language updated successfully",
      });
    } catch (error) {
      console.error("Transaction failed:", error);
      return c.json(
        {
          success: false,
          message: "Failed to update language and translations",
        },
        500
      );
    }
  }
);
