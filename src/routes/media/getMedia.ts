import { Hono } from "hono";
import { db } from "../../db/database";
import { sql } from "kysely";

export const getMedia = new Hono().get("/", async (c) => {
  const limit = parseInt(c.req.query("limit") || "10", 10);
  const page = parseInt(c.req.query("page") || "1", 10);
  const title = c.req.query("title");

  let baseQuery = db
    .selectFrom("media as m")
    .leftJoin("translations as tr", "m.id", "tr.entity_id")
    .leftJoin("languages as l", "tr.language_id", "l.id");

  if (title) {
    const searchPattern = `%${title}%`;
    const matchingMediaIds = db
      .selectFrom("media as m")
      .leftJoin("translations as tr", "m.id", "tr.entity_id")
      .leftJoin("languages as l", "tr.language_id", "l.id")
      .where("tr.field", "=", "title")
      .where(
        sql`unaccent(lower(tr.field_value)) LIKE unaccent(lower(${searchPattern}))`.$castTo<boolean>()
      )
      .select("m.id");

    baseQuery = baseQuery.where("m.id", "in", matchingMediaIds);
  }

  const finalQuery = baseQuery
    .select([
      "m.id as id",
      "m.type as type",
      "m.url as url",
      "m.thumbnail_url as thumbnail_url",
      sql`json_agg(
        CASE 
          WHEN tr.id IS NOT NULL THEN 
            json_build_object(
              'id', tr.id,
              'locale', l.locale,
              'field', tr.field,
              'field_value', tr.field_value
            )
          ELSE NULL 
        END
      ) FILTER (WHERE tr.id IS NOT NULL)`.as("translations"),
    ])
    .groupBy(["m.id", "m.type", "m.url", "m.thumbnail_url"])
    .orderBy("m.id")
    .limit(limit)
    .offset((page - 1) * limit);

  const res = await finalQuery.execute();
  const transformed = transformMediaTranslations(res);
  return c.json({
    media: transformed,
  });
});

type Translation = {
  locale: string;
  field: string;
  field_value: string;
  id: string;
};

type MediaItem = {
  id?: string;
  type?: string;
  url?: string;
  thumbnail_url?: string;
  translations?: Translation[] | null;
};

type TransformedTranslations = {
  [locale: string]: {
    [field: string]: string;
  };
};

type TransformedMediaItem = Omit<MediaItem, "translations"> & {
  translations: TransformedTranslations;
};

export function transformMediaTranslations(
  mediaItems: MediaItem[]
): TransformedMediaItem[] {
  return mediaItems.map((item) => {
    const { translations, ...mediaProps } = item;
    const transformedTranslations: TransformedTranslations = {};

    if (translations) {
      translations.forEach((translation) => {
        const { locale, field, field_value } = translation;
        if (!transformedTranslations[locale]) {
          transformedTranslations[locale] = {};
        }
        transformedTranslations[locale][field] = field_value;
      });
    }

    return {
      ...mediaProps,
      translations: transformedTranslations,
    };
  });
}
