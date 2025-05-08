import { Hono } from "hono";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { areas } from "../../db/schema";

export const getSingleArea = new Hono().get(":id", async (c) => {
  const id = parseInt(c.req.param("id"));

  if (!id) {
    return c.json({ error: "ID is required" }, 400);
  }

  let [result] = await db.query.areas.findMany({
    where: eq(areas.id, id),
    columns: {
      id: true,
      weight: true,
      parentId: true,
    },

    with: {
      translations: {
        columns: {
          id: true,
          title: true,
          subtitle: true,
          description: true,
        },
        with: {
          language: {
            columns: {
              locale: true,
            },
          },
        },
      },
    },
  });

  return c.json({
    area: result,
  });
});
