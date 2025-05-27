import { Hono } from "hono";
import { db } from "../../../db";
import { sql, count, inArray, and, eq } from "drizzle-orm";
import { external_files } from "../../../db/schema/external_files";
import { requiresManager } from "../../../middleware/requiresManager";
import { storage } from "../../../utils/fileStorage";
import { external_file_translations } from "src/db/schema";

export const getExternalFiles = new Hono().get(
  "/",
  requiresManager,
  async (c) => {
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
          fileId: external_files.id,
        })
        .from(external_files)
        .innerJoin(
          external_file_translations,
          eq(external_files.id, external_file_translations.externalFileId)
        )
        .where(
          and(
            eq(external_files.projectId, projectId),
            sql`LOWER(${
              external_file_translations.title
            }) LIKE LOWER(${`%${title}%`})`
          )
        );

      //remove duplicates
      fileIds = Array.from(
        new Set(
          [...translations]
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
        .from(external_files)
        .where(eq(external_files.projectId, projectId));

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
      ? inArray(external_files.id, fileIds)
      : eq(external_files.projectId, projectId);
    // Fetch paginated items
    let filesQuery = db.query.external_files.findMany({
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
      url: storage.getFileUrl(item.url),
    }));

    return c.json({
      externalFiles: transformedItems,
      pagination: {
        limit,
        page,
        totalItems,
        currentPage: page,
        totalPages,
      },
    });
  }
);
