import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "src/db";
import { external_files } from "src/db/schema";
import { requiresManager } from "src/middleware/requiresManager";

export const deleteExternalFile = new Hono().delete(
  "/:id",
  requiresManager,
  async (c) => {
    const externalFileId = parseInt(c.req.param("id"));
    const currentUser = c.get("currentUser");
    const projectId = Number(currentUser.projectId);

    if (isNaN(externalFileId)) {
      return c.json(
        {
          error: "Invalid external file ID",
          details: "Please contact support if this issue persists.",
        },
        400
      );
    }

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
      await db
        .delete(external_files)
        .where(eq(external_files.id, externalFileId));
      return c.json({
        message: `External file with ID ${externalFileId} deleted successfully`,
      });
    } catch (error) {
      return c.json({
        error: "Failed to delete external file",
      });
    }
  }
);
