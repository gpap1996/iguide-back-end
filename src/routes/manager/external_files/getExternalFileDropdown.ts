import { Hono } from "hono";
import { db } from "../../../db";
import { external_files } from "../../../db/schema/external_files";
import { desc, eq } from "drizzle-orm";
import { requiresManager } from "../../../middleware/requiresManager";

export const getExternalFileDropdown = new Hono().get(
  "/",
  requiresManager,
  async (c) => {
    const currentUser = c.get("currentUser");
    const projectId = Number(currentUser.projectId);

    if (!projectId) {
      return c.json(
        {
          error: "Project ID not found for current user",
          details: "Please contact support if this issue persists.",
        },
        400
      );
    }

    try {
      const result = await db
        .select({
          id: external_files.id,
          name: external_files.name,
          url: external_files.url,
          type: external_files.type,
        })
        .from(external_files)
        .where(eq(external_files.projectId, projectId))
        .orderBy(desc(external_files.createdAt));

      return c.json({
        items: result,
      });
    } catch (e) {
      console.error("Error fetching files:", e);
      return c.json({ error: "Failed to fetch files" }, 500);
    }
  }
);
