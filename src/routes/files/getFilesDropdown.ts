import { Hono } from "hono";
import { db } from "../../db";
import { files } from "../../db/schema";
import { desc } from "drizzle-orm";

export const getFilesDropdown = new Hono().get("/dropdown", async (c) => {
  const result = await db
    .select({
      id: files.id,
      fileName: files.fileName,
      thumbnailUrl: files.thumbnailUrl,
      url: files.url,
    })
    .from(files)
    .orderBy(desc(files.createdAt));

  return c.json({
    items: result,
  });
});
