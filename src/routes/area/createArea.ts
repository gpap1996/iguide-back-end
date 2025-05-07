import { Hono } from "hono";
import { db } from "../../db/schema";
import { requiresAdmin } from "../../middleware/requiresAdmin";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const schema = z.object({
  parent_id: z.string().optional(),
  weight: z.number().optional(),
  images: z.array(z.string()).optional(),
  sound: z.string().optional(),
});

export const createArea = new Hono().post(
  "/",
  requiresAdmin,
  zValidator("json", schema),
  async (c) => {
    const area = c.req.valid("json");
    const res = await db
      .insertInto("areas")
      .values(area)
      .returningAll()
      .executeTakeFirstOrThrow();

    return c.json(res);
  }
);
