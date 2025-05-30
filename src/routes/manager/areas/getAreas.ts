import { Hono } from "hono";
import { db } from "../../../db";
import { sql, count, inArray, and, eq } from "drizzle-orm";
import { area_translations, areas } from "../../../db/schema";
import { requiresManager } from "../../../middleware/requiresManager";

export const getAreas = new Hono().get("/", requiresManager, async (c) => {
  const currentUser = c.get("currentUser");
  if (!currentUser?.projectId) {
    return c.json({ error: "Project ID not found for current user" }, 400);
  }
  const projectId = Number(currentUser.projectId);
  const title = c.req.query("title");
  const limit = parseInt(c.req.query("limit") || "10", 10);
  const page = parseInt(c.req.query("page") || "1", 10);

  const offset = (page - 1) * limit;
  let areaIds: number[] = [];

  if (title) {
    const searchPattern = `%${title}%`;
    // Get areas IDs that match the title filter in area_translations
    const matchingAreaIds = title
      ? await db
          .select({ areasId: area_translations.areaId })
          .from(area_translations)
          .innerJoin(areas, eq(areas.id, area_translations.areaId))
          .where(
            and(
              sql<boolean>`unaccent(lower(${area_translations.title})) LIKE unaccent(lower(${searchPattern}))`,
              eq(areas.projectId, projectId)
            )
          )
      : [];

    //remove duplicates
    areaIds = Array.from(
      new Set(
        matchingAreaIds
          .map((item) => item.areasId)
          .filter((id): id is number => id !== undefined) //because typescript sucks
      )
    );

    // No matches for the title: totalItems is 0, and no need to query further
    if (areaIds.length === 0) {
      return c.json({
        areas: [],
        pagination: {
          limit,
          page,
          totalItems: 0,
          currentPage: page,
          totalPages: 0,
        },
      });
    }
  }

  // Count the total items, with optional filtering by title
  const [countQuery] = await db
    .select({ count: count() })
    .from(areas)
    .where(eq(areas.projectId, projectId));

  let totalItems = countQuery.count || 0;
  let totalPages = limit === -1 ? 1 : Math.ceil(totalItems / limit);

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

  const where = title
    ? inArray(areas.id, areaIds)
    : eq(areas.projectId, projectId);
  // Fetch paginated items
  let areasQuery = db.query.areas.findMany({
    where,
    columns: {
      id: true,
      weight: true,
    },

    with: {
      parent: {
        columns: {
          id: true,
        },
        with: {
          translations: {
            columns: {
              id: true,
              title: true,
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
      },

      translations: {
        columns: {
          id: true,
          title: true,
          subtitle: true,
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
    orderBy: (areas, { asc }) => [asc(areas.weight)],
    limit: limit !== -1 ? limit : undefined,
    offset: limit !== -1 ? offset : undefined,
  });

  if (title) {
    totalItems = Number(areaIds.length);
    totalPages = Math.ceil(totalItems / limit);
  }

  const items = await areasQuery.execute();

  return c.json({
    areas: items,
    pagination: {
      limit,
      page,
      totalItems,
      currentPage: page,
      totalPages,
    },
  });
});
