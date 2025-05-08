import { Hono } from "hono";
import { db } from "../../db";
import { sql, count, inArray } from "drizzle-orm";
import { area_translations, areas } from "../../db/schema";

export const getAreas = new Hono().get("/", async (c) => {
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
          .where(
            sql<boolean>`unaccent(lower(${area_translations.title})) LIKE unaccent(lower(${searchPattern}))`
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
    console.log(areaIds);

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
  const [countQuery] = await db.select({ count: count() }).from(areas);

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

  const where = title ? inArray(areas.id, areaIds) : undefined;
  // Fetch paginated items
  let areasQuery = db.query.areas.findMany({
    where,
    with: {
      translations: {
        columns: {
          id: true,
          title: true,
          // description: true,
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
