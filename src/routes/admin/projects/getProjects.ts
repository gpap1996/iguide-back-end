import { Hono } from "hono";
import { requiresAdmin } from "@/middleware/requiresAdmin";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { count, sql } from "drizzle-orm";

export const getProjects = new Hono().get("/", requiresAdmin, async (c) => {
  try {
    const title = c.req.query("title");
    const limit = parseInt(c.req.query("limit") || "10", 10);
    const page = parseInt(c.req.query("page") || "1", 10);
    const offset = (page - 1) * limit;

    // Build the query filter for title search
    let filter = undefined;

    // Add title search condition if provided
    if (title) {
      const searchPattern = `%${title}%`;
      filter = sql`unaccent(lower(${projects.name})) LIKE unaccent(lower(${searchPattern}))`;
    }

    // Get total count with filter
    const [countQuery] = await db
      .select({ count: count() })
      .from(projects)
      .where(filter);

    let totalItems = countQuery.count || 0;
    let totalPages = limit === -1 ? 1 : Math.ceil(totalItems / limit); // Check if the requested page is valid
    if (page > totalPages && totalPages > 0) {
      return c.json(
        {
          error: "Invalid page number",
          message: `Page ${page} exceeds the total number of pages (${totalPages}).`,
        },
        400
      );
    }

    // Query projects with the same filter
    let projectsQuery = db.query.projects.findMany({
      columns: {
        id: true,
        name: true,
        description: true,
        status: true,
        createdAt: true,
      },
      where: filter ? () => filter : undefined,
      orderBy: (projects, { desc }) => [desc(projects.createdAt)],
      limit: limit !== -1 ? limit : undefined,
      offset: limit !== -1 ? offset : undefined,
    });

    const items = await projectsQuery;
    return c.json({
      projects: items,
      pagination: {
        limit,
        page,
        totalItems,
        currentPage: page,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return c.json(
      {
        error: "Failed to fetch projects",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});
