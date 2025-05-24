import { Hono } from "hono";
import { db } from "@/db";
import { files } from "@/db/schema";
import { desc } from "drizzle-orm";

export const getFilesDropdown = new Hono().get("/", async (c) => {
  const result = await db
    .select({
      id: files.id,
      name: files.name,
      thumbnailPath: files.thumbnailPath,
      path: files.path,
    })
    .from(files)
    .orderBy(desc(files.createdAt));

  return c.json({
    items: result,
  });
});
