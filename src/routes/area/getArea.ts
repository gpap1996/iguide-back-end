import { Hono } from "hono";
import { db } from "../../db/database";
import { sql } from "kysely";

export const getAreas = new Hono().get("/:id?", async (c) => {
  const id = Number(c.req.param("id"));
  const parentId = Number(c.req.query("parent_id"));
  const title = c.req.query("title");

  // Start building the base query
  let query = db.selectFrom("areas").selectAll();

  // Conditionally add filters based on provided parameters
  if (id) {
    query = query.where("id", "=", id);
  }

  if (parentId) {
    query = query.where("parent_id", "=", parentId);
  }

  if (title) {
    //search with out being case sensitive and also match greek words with diacritics

    // Add wildcard characters for partial matching
    const searchPattern = `%${title}%`;

    // Use sql tagged template with proper casting to boolean
    query = query.where(
      sql`unaccent(lower(title)) LIKE unaccent(lower(${searchPattern}))`.$castTo<boolean>()
    );
  }

  // Execute the query and return the result
  const res = await query.execute();
  return c.json(res);
});
