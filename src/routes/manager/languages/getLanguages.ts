import { Hono } from "hono";
import { db } from "@/db";
import { languages } from "@/db/schema/languages";
import { sql } from "drizzle-orm";

// Route to get paginated languages
export const getLanguages = new Hono().get("/", async (c) => {
  // Get limit and page parameters from the query, with default values
  const limit = parseInt(c.req.query("limit") || "10", 10);
  const page = parseInt(c.req.query("page") || "1", 10);

  // Handle case where limit is -1 (return all results)
  if (limit === -1) {
    const items = await db.select().from(languages);
    return c.json({
      languages: items,
      pagination: {
        limit,
        page,
        totalItems: items.length,
        currentPage: page,
        totalPages: 1,
      },
    });
  }

  // Calculate offset for pagination
  const offset = (page - 1) * limit;

  // Count the total items
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(languages)
    .execute();

  const totalItems = Number(countResult[0]?.count || 0);
  const totalPages = Math.ceil(totalItems / limit);

  // Check if the requested page is valid
  if (page > totalPages && totalPages > 0) {
    return c.json(
      {
        error: "Invalid page number",
        message: `Page ${page} exceeds the total number of pages (${totalPages}).`,
      },
      400
    );
  }

  // Fetch paginated items
  const items = await db.select().from(languages).limit(limit).offset(offset);

  // Return the items along with pagination details
  return c.json({
    languages: items,
    pagination: {
      limit,
      page,
      totalItems,
      currentPage: page,
      totalPages,
    },
  });
});
