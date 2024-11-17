import { Hono } from "hono";
import fs from "fs";
import path from "path";
import { requiresAdmin } from "../../middleware/requiresAdmin";
import { db } from "../../db/database";

export const deleteMedia = new Hono().delete(
  "/:id",
  requiresAdmin,
  async (c) => {
    const mediaId = c.req.param("id");

    try {
      // First, fetch the media record to get file paths
      const media = await db
        .selectFrom("media")
        .where("id", "=", mediaId)
        .selectAll()
        .executeTakeFirst();

      if (!media) {
        return c.json({ error: "Media not found" }, 404);
      }

      // Begin transaction to ensure data consistency
      await db.transaction().execute(async (trx) => {
        // Delete translations first (foreign key constraint)
        await trx
          .deleteFrom("media_translations")
          .where("media_id", "=", mediaId)
          .execute();

        // Delete media record
        await trx.deleteFrom("media").where("id", "=", mediaId).execute();

        // After successful DB deletion, delete physical files
        try {
          // Delete main file
          const filePath = path.join(".", media.url);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }

          // Delete thumbnail if it exists
          if (media.thumbnail_url) {
            const thumbnailPath = path.join(".", media.thumbnail_url);
            if (fs.existsSync(thumbnailPath)) {
              fs.unlinkSync(thumbnailPath);
            }
          }
        } catch (fileError) {
          console.error("Error deleting physical files:", fileError);
        }
      });

      return c.json({
        success: true,
        message: "Media deleted successfully",
        deletedId: mediaId,
      });
    } catch (error) {
      console.error("Error deleting media:", error);
      return c.json(
        {
          success: false,
          error: "Failed to delete media",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }
);
