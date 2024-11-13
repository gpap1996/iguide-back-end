import { Hono } from "hono";
import { db } from "../../db/database";
import { sql } from "kysely";

// Define TypeScript types for MediaItem and Translation
interface MediaItem {
  id: string;
  type: string;
  url: string;
  created_at: string;
  updated_at: string;
  thumbnail_url?: string;
  translations?: TranslationsByLanguage;
}

interface Translation {
  field: "title" | "description";
  field_value: string;
  language_id: string;
}

// Define a type for translations grouped by language_id
type TranslationsByLanguage = {
  [language_id: string]: {
    title?: string;
    description?: string;
  };
};

export const getMedia = new Hono().get("/:id?", async (c) => {
  // Extract query parameters and pagination settings
  const id = c.req.param("id");
  const title = c.req.query("title");
  const limit = parseInt(c.req.query("limit") || "10", 10);
  const page = parseInt(c.req.query("page") || "1", 10);

  // Build base query for media
  let baseQuery = db.selectFrom("media").selectAll();

  // Apply filters based on query parameters
  if (id) {
    baseQuery = baseQuery.where("id", "=", id);
  }

  if (title) {
    const searchPattern = `%${title}%`;
    baseQuery = baseQuery.where(
      sql`unaccent(lower(title)) LIKE unaccent(lower(${searchPattern}))`.$castTo<boolean>()
    );
  }

  // Handle case where limit is -1 (return all results)
  if (limit === -1) {
    const items: MediaItem[] = await baseQuery.execute();

    // Fetch and group translations for each item
    for (const item of items) {
      const translations = await db
        .selectFrom("translations")
        .select(["field", "field_value", "language_id"])
        .where("entity_type", "=", "media")
        .where("entity_id", "=", item.id)
        .execute();

      item.translations = groupTranslationsByLanguage(translations);
    }

    return c.json({
      media: items,
      pagination: {
        limit,
        page,
        totalItems: items.length,
        currentPage: page,
        totalPages: 1,
      },
    });
  }

  // Calculate offset for pagination
  const offset = (page - 1) * limit;

  // Count the total items
  const countResult = await baseQuery
    .clearSelect()
    .select(sql`COUNT(*)`.as("count"))
    .execute();
  const totalItems = Number(countResult[0]?.count || 0);
  const totalPages = Math.ceil(totalItems / limit);

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
  const items: MediaItem[] = await baseQuery
    .limit(limit)
    .offset(offset)
    .execute();

  // Fetch and group translations for each item
  for (const item of items) {
    const translations: Translation[] = await db
      .selectFrom("translations")
      .select(["field", "field_value", "language_id"])
      .where("entity_type", "=", "media")
      .where("entity_id", "=", item.id)
      .execute();

    item.translations = groupTranslationsByLanguage(translations);
  }

  // Return the items along with pagination details
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

// Helper function to group translations by language_id
function groupTranslationsByLanguage(
  translations: Translation[]
): TranslationsByLanguage {
  const grouped: TranslationsByLanguage = {};

  translations.forEach((translation) => {
    const { language_id, field, field_value } = translation;

    // Initialize the language key if it doesn't exist
    if (!grouped[language_id]) {
      grouped[language_id] = {};
    }

    // Assign the field values based on the field name
    if (field === "title") {
      grouped[language_id].title = field_value;
    } else if (field === "description") {
      grouped[language_id].description = field_value;
    }
  });

  return grouped;
}
