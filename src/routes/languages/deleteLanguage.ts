import { Hono } from "hono";
import { db } from "../../db/database";
import { requiresAdmin } from "../../middleware/requiresAdmin";

export const deleteLanguage = new Hono().delete(
  "/:id", // Use DELETE method for deletion
  requiresAdmin,
  async (c) => {
    const id = c.req.param("id");

    try {
      // Start transaction
      await db.transaction().execute(async (trx) => {
        // Step 1: Fetch the language (locale) from the `languages` table by ID
        const existingLanguage = await trx
          .selectFrom("languages")
          .select("locale")
          .where("id", "=", id)
          .executeTakeFirst();

        if (!existingLanguage) {
          return c.json({ success: false, message: "Language not found" }, 404);
        }

        const oldLocale = existingLanguage.locale;

        // Step 2: Delete translations associated with the language's locale
        await trx
          .deleteFrom("translations")
          .where("locale", "=", oldLocale)
          .execute();

        // Step 3: Delete the language from the `languages` table
        await trx.deleteFrom("languages").where("id", "=", id).execute();
      });

      return c.json({
        success: true,
        message: "Language and related translations deleted successfully",
      });
    } catch (error) {
      console.error("Transaction failed:", error);
      return c.json(
        {
          success: false,
          message: "Failed to delete language and translations",
        },
        500
      );
    }
  }
);
