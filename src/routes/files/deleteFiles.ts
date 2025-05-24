import { Hono } from "hono";
import fs from "fs";
import path from "path";
import { requiresAdmin } from "../../middleware/requiresAdmin";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../../db";
import { files } from "../../db/schema/files";
import { file_translations } from "../../db/schema/file_translations";
import { eq, inArray } from "drizzle-orm";

const schema = z.object({
  ids: z.array(z.number()),
});

// Use Hono app style
export const deleteFiles = new Hono().post(
  "/",
  requiresAdmin,
  zValidator("json", schema),
  async (c) => {
    const { ids } = c.req.valid("json");

    if (!ids || ids.length === 0) {
      return c.json({ error: "No file IDs provided" }, 400);
    }

    try {
      // First, fetch all the file records to get file paths
      const filesToDelete = await db
        .select({
          id: files.id,
          thumbnailPath: files.thumbnailPath,
          path: files.path,
          type: files.type,
        })
        .from(files)
        .where(inArray(files.id, ids));

      if (filesToDelete.length === 0) {
        return c.json({ error: "No files found with the provided IDs" }, 404);
      }
      const results = {
        success: [] as number[],
        failed: [] as Array<{ id: number; error: string }>,
        totalDeleted: 0,
        totalFailed: 0,
      };

      // Begin transaction to ensure data consistency
      await db.transaction(async (trx) => {
        // Delete file records and their translations
        await trx.delete(files).where(inArray(files.id, ids));
      });

      // After successful DB deletion, delete physical files
      for (const file of filesToDelete) {
        try {
          // Delete main file
          const filePath = path.join(".", file.path);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }

          // Delete thumbnail if it's an image type and has a thumbnail
          if (file.type === "image" && file.thumbnailPath) {
            const thumbnailPath = path.join(".", file.thumbnailPath);
            if (fs.existsSync(thumbnailPath)) {
              fs.unlinkSync(thumbnailPath);
            }
          }

          results.success.push(file.id);
          results.totalDeleted++;
        } catch (fileError) {
          console.error(`Error deleting physical file ${file.id}:`, fileError);
          results.failed.push({
            id: file.id,
            error:
              fileError instanceof Error ? fileError.message : "Unknown error",
          });
          results.totalFailed++;
        }
      }

      return c.json({
        success: true,
        message: `${results.totalDeleted} files deleted successfully${
          results.totalFailed > 0 ? `, ${results.totalFailed} failed` : ""
        }`,
        results,
      });
    } catch (error) {
      console.error("Error in mass file deletion:", error);
      return c.json(
        {
          success: false,
          error: "Failed to delete files",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }
);
