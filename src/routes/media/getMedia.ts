import { Hono } from "hono";
import { db } from "../../db/database";
import { sql } from "kysely";

export const getMedia = new Hono().get("/:id?", async (c) => {
  const id = c.req.param("id");
  const title = c.req.query("title");

  // Pagination parameters
  const limit = parseInt(c.req.query("limit") || "10", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  // Base query
  let query = db.selectFrom("media").selectAll();

  // Conditionally add filters based on provided parameters
  if (id) {
    query = query.where("id", "=", id);
  }

  if (title) {
    const searchPattern = `%${title}%`;
    query = query.where(
      sql`unaccent(lower(title)) LIKE unaccent(lower(${searchPattern}))`.$castTo<boolean>()
    );
  }

  if (offset) {
    query = query.limit(limit).offset(offset);

    const res = await query.execute();
    return c.json({ data: res, pagination: { limit, offset } });
  } else {
    const res = await query.execute();
    return c.json(res);
  }
});
