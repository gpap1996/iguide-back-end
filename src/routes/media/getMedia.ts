import { Hono } from "hono";
import { db } from "../../db/database";
import { sql } from "kysely";
import { getPaginationParams, paginateQuery } from "../../utils/pagination";

export const getMedia = new Hono().get("/:id?", async (c) => {
  const id = c.req.param("id");
  const title = c.req.query("title");
  const paginationParams = getPaginationParams(c);

  // Build base query
  let baseQuery = db.selectFrom("media").selectAll();

  // Apply filters
  if (id) {
    baseQuery = baseQuery.where("id", "=", id);
  }

  if (title) {
    const searchPattern = `%${title}%`;
    baseQuery = baseQuery.where(
      sql`unaccent(lower(title)) LIKE unaccent(lower(${searchPattern}))`.$castTo<boolean>()
    );
  }

  // Get paginated results
  const result = await paginateQuery(baseQuery, paginationParams);

  if (!result.success) {
    // Use the status code as a number
    return c.json(
      {
        error: result.error,
        message: result.message,
      },
      result.statusCode as 400 | 500
    ); // or explicitly as 400
  }

  return c.json({
    media: result.items,
    pagination: result.pagination,
  });
});
