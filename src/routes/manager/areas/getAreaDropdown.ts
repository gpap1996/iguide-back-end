import { Hono } from "hono";
import { db } from "@/db";
import { languages, area_translations, areas } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export const getAreasDropdown = new Hono().get("/dropdown", async (c) => {
  const acceptLanguage = c.req.header("Accept-Language") || "en"; // Default to 'en' if not provided

  const result = await db
    .select({
      id: areas.id,
      title: area_translations.title,
    })
    .from(areas)
    .leftJoin(area_translations, eq(areas.id, area_translations.areaId))
    .leftJoin(languages, eq(languages.id, area_translations.languageId))
    .where(eq(languages.locale, acceptLanguage))
    .orderBy(asc(areas.weight));

  return c.json({
    items: result,
  });
});
