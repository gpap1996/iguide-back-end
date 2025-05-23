import { Hono } from "hono";
import fs from "fs";
import path from "path";
import { requiresAdmin } from "../../middleware/requiresAdmin";
import { db } from "../../db";
import { files } from "../../db/schema/files";
import { file_translations } from "../../db/schema/file_translations";
import { eq } from "drizzle-orm";

export const deleteFile = new Hono().delete(
  "/:id",
  requiresAdmin,
  async (c) => {
    const fileId = parseInt(c.req.param("id"));

    try {
      // First, fetch the file record to get file paths
      const [foundFile] = await db
        .select({
          id: files.id,
          thumbnailUrl: files.thumbnailUrl,
          url: files.url,
        })
        .from(files)
        .where(eq(files.id, fileId));

      if (!foundFile) {
        return c.json({ error: "File not found" }, 404);
      }

      // Begin transaction to ensure data consistency
      await db.transaction(async (trx) => {
        // Delete file record
        await trx.delete(files).where(eq(files.id, fileId));

        // After successful DB deletion, delete physical files
        try {
          // Delete main file
          const filePath = path.join(".", foundFile.url);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }

          // Delete thumbnail if it exists
          if (foundFile.thumbnailUrl) {
            const thumbnailPath = path.join(".", foundFile.thumbnailUrl);
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
        message: "File deleted successfully",
        deletedId: fileId,
      });
    } catch (error) {
      console.error("Error deleting file:", error);
      return c.json(
        {
          success: false,
          error: "Failed to delete file",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }
);
