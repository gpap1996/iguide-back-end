import { Hono } from "hono";
import { db } from "../../database";
import { requiresAuth } from "../../middleware/requiresAuth";

export const createArea = new Hono().post(
  "/",
  requiresAuth,
  // requiresAdmin,
  async (c) => {
    const area = await c.req.json();
    const res = await db
      .insertInto("areas")
      .values(area)
      .returningAll()
      .executeTakeFirstOrThrow();

    return c.json(res);
  }
);
