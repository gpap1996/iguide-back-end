import { db } from "@/db";
import { users } from "@/db/schema";
import { requiresAdmin } from "@/middleware/requiresAdmin";
import { count, eq, and } from "drizzle-orm";
import { Hono } from "hono";

export const getUsers = new Hono().get("/", requiresAdmin, async (c) => {
  try {
    const projectIdParam = c.req.query("projectId");
    const limit = parseInt(c.req.query("limit") || "10", 10);
    const page = parseInt(c.req.query("page") || "1", 10);
    const offset = (page - 1) * limit;

    // Build where conditions
    let whereConditions = [];

    // Always filter for manager role
    whereConditions.push(eq(users.role, "manager"));

    // Add project filter if projectId is provided
    if (projectIdParam) {
      const projectId = parseInt(projectIdParam, 10);
      if (!isNaN(projectId)) {
        whereConditions.push(eq(users.projectId, projectId));
      }
    }

    // Get total count of manager users with filters
    const [countQuery] = await db
      .select({ count: count() })
      .from(users)
      .where(
        whereConditions.length === 1
          ? whereConditions[0]
          : and(...whereConditions)
      );

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

    // Query users with pagination and filters
    let usersQuery = db.query.users.findMany({
      where: (users, { eq, and }) => {
        const conditions = [eq(users.role, "manager")];

        if (projectIdParam) {
          const projectId = parseInt(projectIdParam, 10);
          if (!isNaN(projectId)) {
            conditions.push(eq(users.projectId, projectId));
          }
        }

        return conditions.length === 1 ? conditions[0] : and(...conditions);
      },
      with: {
        project: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: (users, { desc }) => [desc(users.createdAt)],
      limit: limit !== -1 ? limit : undefined,
      offset: limit !== -1 ? offset : undefined,
    });

    const items = await usersQuery;

    return c.json({
      users: items,
      pagination: {
        limit,
        page,
        totalItems,
        currentPage: page,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return c.json(
      {
        error: "Failed to fetch users",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});
