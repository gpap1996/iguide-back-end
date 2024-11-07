import { Hono } from "hono";
import { db } from "../../database";
import { AreaUpdate, Area, NewArea } from "../../types";

export const areasRoutes = new Hono()
  .get("/:id?", async (c) => {
    const id = Number(c.req.param("id"));
    let res;
    if (id)
      res = await db
        .selectFrom("areas")
        .where("id", "=", id)
        .selectAll()
        .executeTakeFirst();
    else res = await db.selectFrom("areas").selectAll().execute();
    return c.json(res);
  })

  .post("/", async (c) => {
    const area: NewArea = await c.req.json();
    const res = await db
      .insertInto("areas")
      .values(area)
      .returningAll()
      .executeTakeFirstOrThrow();

    return c.json(res);
  });
