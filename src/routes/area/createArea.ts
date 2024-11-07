import { Hono } from "hono";
import { db } from "../../database";
import { NewArea } from "../../types";

export const createArea = new Hono().post("/", async (c) => {
  const area: NewArea = await c.req.json();
  const res = await db
    .insertInto("areas")
    .values(area)
    .returningAll()
    .executeTakeFirstOrThrow();

  return c.json(res);
});
