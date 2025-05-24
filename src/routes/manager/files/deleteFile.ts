import { Hono } from "hono";
import fs from "fs";
import path from "path";
import { requiresManager } from "@/middleware/requiresManager";
import { db } from "@/db";
import { files } from "@/db/schema/files";
import { eq } from "drizzle-orm";

export const deleteFile = new Hono().delete(
  "/:id",
  requiresManager,
  async (c) => {
    const currentUser = c.get("currentUser");
    const fileId = parseInt(c.req.param("id"));

    if (!currentUser?.projectId) {
      return c.json({ error: "Project ID not found for current user" }, 400);
    }

    const projectId = Number(currentUser.projectId);

    try {
      // First, fetch the file record to get file paths
      const [foundFile] = await db
        .select({
          id: files.id,
          thumbnailPath: files.thumbnailPath,
          path: files.path,
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
          const filePath = path.join(".", foundFile.path);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }

          // Delete thumbnail if it exists
          if (foundFile.thumbnailPath) {
            const thumbnailPath = path.join(".", foundFile.thumbnailPath);
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
