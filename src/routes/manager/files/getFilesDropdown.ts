import { Hono } from "hono";
import { db } from "@/db";
import { files } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requiresManager } from "@/middleware/requiresManager";

export const getFilesDropdown = new Hono().get(
  "/",
  requiresManager,
  async (c) => {
    const currentUser = c.get("currentUser");
    if (!currentUser?.projectId) {
      return c.json({ error: "Project ID not found for current user" }, 400);
    }
    const projectId = Number(currentUser.projectId);

    try {
      const result = await db
        .select({
          id: files.id,
          name: files.name,
          thumbnailPath: files.thumbnailPath,
          path: files.path,
        })
        .from(files)
        .where(eq(files.projectId, projectId))
        .orderBy(desc(files.createdAt));

      return c.json({
        items: result,
      });
    } catch (e) {
      console.error("Error fetching files:", e);
      return c.json({ error: "Failed to fetch files" }, 500);
    }
  }
);
