import { Hono } from "hono";
import { requiresManager } from "../../../middleware/requiresManager";
import { db } from "../../../db";
import { files } from "../../../db/schema/files";
import { eq } from "drizzle-orm";
import { storage } from "../../../utils/fileStorage";

export const deleteFile = new Hono().delete(
  "/:id",
  requiresManager,
  async (c) => {
    const fileId = parseInt(c.req.param("id"));

    try {
      // First, fetch the file record to get file paths
      const [foundFile] = await db
        .select({
          id: files.id,
          thumbnailPath: files.thumbnailPath,
          path: files.path,
          projectId: files.projectId,
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
          if (foundFile.path) {
            console.log(`Deleting file: ${foundFile.path}`);
            await storage.deleteFile(foundFile.path);
          }

          // Delete thumbnail if it exists
          if (foundFile.thumbnailPath) {
            console.log(`Deleting thumbnail: ${foundFile.thumbnailPath}`);
            await storage.deleteFile(foundFile.thumbnailPath);
          }
        } catch (fileError) {
          console.error("Error deleting physical files:", fileError);
          // Don't throw here, as the DB transaction was successful
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
