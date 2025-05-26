import { Hono } from "hono";
import { db } from "../../../db";
import { sql, count, inArray, and, eq } from "drizzle-orm";
import { file_translations } from "../../../db/schema/file_translations";
import { files } from "../../../db/schema/files";
import { requiresManager } from "../../../middleware/requiresManager";
import { storage } from "../../../utils/fileStorage";

export const getFiles = new Hono().get("/", requiresManager, async (c) => {
  const currentUser = c.get("currentUser");
  const title = c.req.query("title");
  const limit = parseInt(c.req.query("limit") || "10", 10);
  const page = parseInt(c.req.query("page") || "1", 10);
  const projectId = Number(currentUser.projectId);
  if (!projectId) {
    return c.json(
      {
        error: "Project ID not found for current user",
        details: "Please contact support if this issue persists.",
      },
      400
    );
  }

  const offset = (page - 1) * limit;
  let fileIds: number[] = [];
  if (title) {
    // Search in translations and file names
    const translations = await db
      .select({
        fileId: file_translations.fileId,
      })
      .from(file_translations)
      .innerJoin(files, eq(files.id, file_translations.fileId))
      .where(
        and(
          eq(files.projectId, projectId),
          sql`LOWER(${file_translations.title}) LIKE LOWER(${`%${title}%`})`
        )
      );

    const fileNames = await db
      .select({
        fileId: files.id,
      })
      .from(files)
      .where(
        and(
          eq(files.projectId, projectId),
          sql`LOWER(${files.name}) LIKE LOWER(${`%${title}%`})`
        )
      );

    //remove duplicates
    fileIds = Array.from(
      new Set(
        [...translations, ...fileNames]
          .map((item) => item.fileId)
          .filter((id): id is number => id !== undefined)
      )
    );
  }

  // Get total count for pagination
  let totalItems = 0;
  let totalPages = 0;

  if (title) {
    totalItems = fileIds.length;
    totalPages = Math.ceil(totalItems / limit);
  } else {
    const [{ value }] = await db
      .select({
        value: count(),
      })
      .from(files)
      .where(eq(files.projectId, projectId));

    totalItems = Number(value);
    totalPages = Math.ceil(totalItems / limit);
  }

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
    : eq(files.projectId, projectId);
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

  // Transform the items to include full URLs
  const transformedItems = items.map((item) => ({
    ...item,
    url: storage.getFileUrl(item.path),
    thumbnailUrl: item.thumbnailPath
      ? storage.getFileUrl(item.thumbnailPath)
      : undefined,
  }));

  return c.json({
    files: transformedItems,
    pagination: {
      limit,
      page,
      totalItems,
      currentPage: page,
      totalPages,
    },
  });
});
