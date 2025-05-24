import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requiresAdmin } from "../../middleware/requiresAdmin";
import { db } from "../../db";
import { projects } from "../../db/schema";
import { eq } from "drizzle-orm";

const schema = z.object({
  name: z.string({ required_error: "Name is required" }),
  description: z.string().optional(),
  status: z.boolean().default(true),
});
export const updateProject = new Hono().put(
  "/:id",
  requiresAdmin,
  zValidator("json", schema),
  async (c) => {
    const newProject = c.req.valid("json");
    const id = parseInt(c.req.param("id"));

    if (!id) {
      return c.json({ error: "Project ID is required" }, 400);
    }

    try {
      const [result] = await db
        .update(projects)
        .set(newProject)
        .where(eq(projects.id, id))
        .returning();

      return c.json(
        {
          result,
        },
        200
      );
    } catch (e) {
      return c.json(
        { error: "Failed to create project", message: e.message },
        500
      );
    }
  }
);
