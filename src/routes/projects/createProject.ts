import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requiresAdmin } from "../../middleware/requiresAdmin";
import { db } from "../../db";
import { projects } from "../../db/schema";
const schema = z.object({
  name: z.string({ required_error: "Name is required" }),
  description: z.string().optional(),
  status: z.boolean().default(true),
});
export const createProject = new Hono().post(
  "/",
  requiresAdmin,
  zValidator("json", schema),
  async (c) => {
    const project = c.req.valid("json");

    try {
      const [result] = await db.insert(projects).values(project).returning();
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
