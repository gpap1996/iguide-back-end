import { Hono } from "hono";
import { db } from "../../db/schema";
import { requiresAdmin } from "../../middleware/requiresAdmin";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const schema = z.object({
  name: z.string({ required_error: "Language name is required" }),
  locale: z.string({ required_error: "Language code is required" }),
});

export const createLanguage = new Hono().patch(
  "/:id",
  requiresAdmin,
  zValidator("json", schema),
  async (c) => {
    const language = c.req.valid("json");
    const id = c.req.param("id");
    const newLocale = language.locale;

    try {
      // Start transaction
      await db.transaction().execute(async (trx) => {
        // Step 1: Fetch the old locale from the `languages` table
        const existingLanguage = await trx
          .selectFrom("languages")
          .select("locale")
          .where("id", "=", id)
          .executeTakeFirst();

        if (!existingLanguage) {
          return c.json({ success: false, message: "Language not found" }, 404);
        }

        const oldLocale = existingLanguage.locale;

        // Step 2: Update the `translations` table, setting `locale` to `newLocale` where `locale` is `oldLocale`
        await trx
          .updateTable("translations")
          .set({ locale: newLocale })
          .where("locale", "=", oldLocale)
          .execute();

        // Step 3: Update the `languages` table with the new language data
        await trx
          .updateTable("languages")
          .set(language)
          .where("id", "=", id)
          .execute();
      });

      return c.json({
        success: true,
        message: "Language and translations updated successfully",
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
