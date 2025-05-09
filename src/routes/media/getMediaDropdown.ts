import { Hono } from "hono";
import { db } from "../../db";
import { media } from "../../db/schema";
import { desc } from "drizzle-orm";

export const getMediaDropdown = new Hono().get("/dropdown", async (c) => {
  const result = await db
    .select({
      id: media.id,
      fileName: media.fileName,
      thumbnailUrl: media.thumbnailUrl,
      url: media.url,
    })
    .from(media)
    .orderBy(desc(media.createdAt));

  return c.json({
    items: result,
  });
});
