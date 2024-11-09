import { Hono } from "hono";
import { db } from "../../database";
import { requiresAdmin } from "../../middleware/requiresAdmin";

export const createArea = new Hono().post("/", requiresAdmin, async (c) => {
  const area = await c.req.json();
  const res = await db
    .insertInto("areas")
    .values(area)
    .returningAll()
    .executeTakeFirstOrThrow();

  return c.json(res);
});
