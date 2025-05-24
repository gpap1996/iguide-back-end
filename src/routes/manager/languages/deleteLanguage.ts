import { Hono } from "hono";
import { db } from "@/db";
import { languages } from "@/db/schema/languages";
import { requiresManager } from "@/middleware/requiresManager";
import { eq } from "drizzle-orm";

export const deleteLanguage = new Hono().delete(
  "/:id", // Use DELETE method for deletion
  requiresManager,
  async (c) => {
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

        // Step 2: Delete the language from the `languages` table
        await trx.delete(languages).where(eq(languages.id, id));
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
