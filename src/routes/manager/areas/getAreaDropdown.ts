import { Hono } from "hono";
import { db } from "@/db";
import { languages, area_translations, areas } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { requiresManager } from "@/middleware/requiresManager";

export const getAreasDropdown = new Hono().get(
  "/dropdown",
  requiresManager,
  async (c) => {
    const acceptLanguage = c.req.header("Accept-Language") || "en"; // Default to 'en' if not provided
    const currentUser = c.get("currentUser");
    if (!currentUser?.projectId) {
      return c.json({ error: "Project ID not found for current user" }, 400);
    }
    const projectId = Number(currentUser.projectId);

    const result = await db
      .select({
        id: areas.id,
        title: area_translations.title,
      })
      .from(areas)
      .leftJoin(area_translations, eq(areas.id, area_translations.areaId))
      .leftJoin(languages, eq(languages.id, area_translations.languageId))
      .where(
        and(
          eq(languages.locale, acceptLanguage),
          eq(areas.projectId, projectId)
        )
      )
      .orderBy(asc(areas.weight));

    return c.json({
      items: result,
    });
  }
);
