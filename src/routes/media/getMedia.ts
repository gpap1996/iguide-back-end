import { Hono } from "hono";
import { db } from "../../db";
import { sql, count, inArray } from "drizzle-orm";
import { media_translations } from "../../db/schema/media_translations";
import { media } from "../../db/schema/media";

export const getMedia = new Hono().get("/", async (c) => {
  const title = c.req.query("title");
  const limit = parseInt(c.req.query("limit") || "10", 10);
  const page = parseInt(c.req.query("page") || "1", 10);

  const offset = (page - 1) * limit;
  let mediaIds: number[] = [];

  if (title) {
    const searchPattern = `%${title}%`;
    // Get media IDs that match the title filter in media_translations
    const matchingMediaIds = title
      ? await db
          .select({ mediaId: media_translations.mediaId })
          .from(media_translations)
          .where(
            sql<boolean>`unaccent(lower(${media_translations.title})) LIKE unaccent(lower(${searchPattern}))`
          )
      : [];

    //remove duplicates
    mediaIds = Array.from(
      new Set(
        matchingMediaIds
          .map((item) => item.mediaId)
          .filter((id): id is number => id !== undefined) //because typescript sucks
      )
    );
    console.log(mediaIds);

    // No matches for the title: totalItems is 0, and no need to query further
    if (mediaIds.length === 0) {
      return c.json({
        media: [],
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
  const [countQuery] = await db.select({ count: count() }).from(media);

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

  const where = title ? inArray(media.id, mediaIds) : undefined;
  // Fetch paginated items
  let mediaQuery = db.query.media.findMany({
    where,
    with: {
      translations: {
        columns: {
          id: true,
          title: true,
          // description: true,
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
    orderBy: (media, { desc }) => [desc(media.createdAt)],
    limit: limit !== -1 ? limit : undefined,
    offset: limit !== -1 ? offset : undefined,
  });

  if (title) {
    totalItems = Number(mediaIds.length);
    totalPages = Math.ceil(totalItems / limit);
  }

  const items = await mediaQuery.execute();

  return c.json({
    media: items,
    pagination: {
      limit,
      page,
      totalItems,
      currentPage: page,
      totalPages,
    },
  });
});
