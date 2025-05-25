import { Hono } from "hono";
import { requiresManager } from "../../../middleware/requiresManager";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../../../db";
import { files } from "../../../db/schema/files";
import { inArray, eq, and } from "drizzle-orm";
import { storage } from "../../../utils/fileStorage";

const schema = z.object({
  ids: z.array(z.number()),
});

// Use Hono app style
export const deleteFiles = new Hono().post(
  "/",
  requiresManager,
  zValidator("json", schema),
  async (c) => {
    const currentUser = c.get("currentUser");
    const { ids } = c.req.valid("json");

    if (!currentUser?.projectId) {
      return c.json({ error: "Project ID not found for current user" }, 400);
    }

    if (!ids || ids.length === 0) {
      return c.json({ error: "No file IDs provided" }, 400);
    }

    const projectId = Number(currentUser.projectId);

    try {
      // First, fetch all the file records to get file paths
      const filesToDelete = await db
        .select({
          id: files.id,
          thumbnailPath: files.thumbnailPath,
          path: files.path,
          type: files.type,
          projectId: files.projectId,
        })
        .from(files)
        .where(and(inArray(files.id, ids), eq(files.projectId, projectId)));

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
        // Delete file records
        await trx
          .delete(files)
          .where(and(inArray(files.id, ids), eq(files.projectId, projectId)));
      });

      // After successful DB deletion, delete physical files
      const deletePromises = filesToDelete.map(async (file) => {
        try {
          // Delete main file
          if (file.path) {
            console.log(`Deleting file: ${file.path}`);
            await storage.deleteFile(file.path);
          }

          // Delete thumbnail if it's an image type and has a thumbnail
          if (file.type === "image" && file.thumbnailPath) {
            console.log(`Deleting thumbnail: ${file.thumbnailPath}`);
            await storage.deleteFile(file.thumbnailPath);
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
      });

      // Wait for all delete operations to complete
      await Promise.all(deletePromises);

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
