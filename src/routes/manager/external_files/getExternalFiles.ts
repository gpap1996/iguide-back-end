import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "src/db";
import { external_files } from "src/db/schema/external_files";
import { requiresManager } from "src/middleware/requiresManager";

export const getExternalFiles = new Hono().get(
  "/",
  requiresManager,
  async (c) => {
    const currentUser = c.get("currentUser");
    const projectId = Number(currentUser.projectId);

    if (!projectId) {
      return c.json({ error: "Project ID not found for current user" }, 400);
    }

    const externalFiles = await db.query.external_files.findMany({
      where: eq(external_files.projectId, projectId),
      with: {
        translations: true,
      },
    });

    return c.json(externalFiles);
  }
);
