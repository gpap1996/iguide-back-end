import { Hono } from "hono";
import fs from "fs";
import path from "path";
import { requiresAdmin } from "../../middleware/requiresAdmin";
import { db } from "../../db";
import { media } from "../../db/schema/media";
import { media_translations } from "../../db/schema/media_translations";
import { eq } from "drizzle-orm";

export const deleteMedia = new Hono().delete(
  "/:id",
  requiresAdmin,
  async (c) => {
    const mediaId = parseInt(c.req.param("id"));

    try {
      // First, fetch the media record to get file paths
      const [foundMedia] = await db
        .select({
          id: media.id,
          thumbnailUrl: media.thumbnailUrl,
          url: media.url,
        })
        .from(media)
        .where(eq(media.id, mediaId));

      if (!foundMedia) {
        return c.json({ error: "Media not found" }, 404);
      }

      // Begin transaction to ensure data consistency
      await db.transaction(async (trx) => {
        // Delete media record
        await trx.delete(media).where(eq(media.id, mediaId)).execute();

        // After successful DB deletion, delete physical files
        try {
          // Delete main file
          const filePath = path.join(".", foundMedia.url);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }

          // Delete thumbnail if it exists
          if (foundMedia.thumbnailUrl) {
            const thumbnailPath = path.join(".", foundMedia.thumbnailUrl);
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
