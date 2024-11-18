import { Hono } from "hono";
import { db } from "../../db/database";
import { jsonArrayFrom } from "kysely/helpers/postgres";
import { sql } from "kysely";

export const getMedia = new Hono().get("/", async (c) => {
  const title = c.req.query("title");
  const limit = parseInt(c.req.query("limit") || "10", 10);
  const page = parseInt(c.req.query("page") || "1", 10);

  const offset = (page - 1) * limit;

  let mediaIds: string[] = [];

  if (title) {
    const searchPattern = `%${title}%`;
    // Get media IDs that match the title filter in media_translations
    const matchingMediaIds = title
      ? await db
          .selectFrom("media_translations")
          .select("media_id")
          .where(
            sql`unaccent(lower(title)) LIKE unaccent(lower(${searchPattern}))`.$castTo<boolean>()
          )
          .execute()
      : [];

    //remove duplicates
    mediaIds = Array.from(
      new Set(
        matchingMediaIds
          .map((item) => item.media_id)
          .filter((id): id is string => id !== undefined) //because typescript sucks
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
  const countQuery = db.selectFrom("media").select(sql`COUNT(*)`.as("count"));

  const countResult = await countQuery.execute();
  let totalItems = Number(countResult[0]?.count || 0);
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

  // Fetch paginated items
  let mediaQuery = db
    .selectFrom("media")
    .select((eb) => [
      "id",
      "url",
      "thumbnail_url",
      "type",
      jsonArrayFrom(
        eb
          .selectFrom("media_translations")
          .select([
            "media_translations.title",
            "media_translations.description",
            "media_translations.language_id",
            eb
              .selectFrom("languages")
              .select("locale")
              .whereRef("languages.id", "=", "media_translations.language_id")
              .as("locale"),
          ])
          .whereRef("media_translations.media_id", "=", "media.id")
      ).as("translations"),
    ])
    .$if(limit !== -1, (qb) => qb.limit(limit).offset(offset))
    .orderBy("created_at", "desc");

  if (title) {
    mediaQuery = mediaQuery.where("id", "in", mediaIds);
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
