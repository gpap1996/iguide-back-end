import { Hono } from "hono";
import { db } from "../../db/database";
import { jsonArrayFrom } from "kysely/helpers/postgres";
import { sql } from "kysely";

export const getMedia = new Hono().get("/", async (c) => {
  const title = c.req.query("title");

  const query = db.selectFrom("media").select((eb) => [
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
  ]);

  const res = await query.execute();

  return c.json({
    media: res,
  });
});
