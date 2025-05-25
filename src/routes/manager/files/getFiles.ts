import { Hono } from "hono";
import { db } from "../../../db";
import { sql, count, inArray, and, eq } from "drizzle-orm";
import { file_translations } from "../../../db/schema/file_translations";
import { files } from "../../../db/schema/files";
import { requiresManager } from "../../../middleware/requiresManager";

export const getFiles = new Hono().get("/", requiresManager, async (c) => {
  const currentUser = c.get("currentUser");
  const title = c.req.query("title");
  const limit = parseInt(c.req.query("limit") || "10", 10);
  const page = parseInt(c.req.query("page") || "1", 10);

  if (!currentUser?.projectId) {
    return c.json({ error: "Project ID not found for current user" }, 400);
  }

  const offset = (page - 1) * limit;
  let fileIds: number[] = [];
  if (title) {
    const searchPattern = `%${title}%`;
    // Get files IDs that match the title filter in file_translations or files.name
    const matchingfileIds = title
      ? await db
          .select({ fileId: file_translations.fileId })
          .from(file_translations)
          .where(
            and(
              sql<boolean>`unaccent(lower(${file_translations.title})) LIKE unaccent(lower(${searchPattern}))`,
              eq(file_translations.projectId, currentUser.projectId)
            )
          )
          .union(
            db
              .select({ fileId: files.id })
              .from(files)
              .where(
                and(
                  sql<boolean>`unaccent(lower(${files.name})) LIKE unaccent(lower(${searchPattern}))`,
                  eq(files.projectId, currentUser.projectId)
                )
              )
          )
      : [];

    //remove duplicates
    fileIds = Array.from(
      new Set(
        matchingfileIds
          .map((item) => item.fileId)
          .filter((id): id is number => id !== undefined) //because typescript sucks
      )
    );

    // No matches for the title: totalItems is 0, and no need to query further
    if (fileIds.length === 0) {
      return c.json({
        files: [],
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
    .from(files)
    .where(eq(files.projectId, currentUser.projectId));

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
    ? inArray(files.id, fileIds)
    : eq(files.projectId, currentUser.projectId);
  // Fetch paginated items
  let filesQuery = db.query.files.findMany({
    where,
    with: {
      translations: {
        columns: {
          id: true,
          title: true,
          description: true,
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
    orderBy: (files, { desc }) => [desc(files.createdAt)],
    limit: limit !== -1 ? limit : undefined,
    offset: limit !== -1 ? offset : undefined,
  });

  if (title) {
    totalItems = Number(fileIds.length);
    totalPages = Math.ceil(totalItems / limit);
  }

  const items = await filesQuery.execute();

  return c.json({
    files: items,
    pagination: {
      limit,
      page,
      totalItems,
      currentPage: page,
      totalPages,
    },
  });
});
