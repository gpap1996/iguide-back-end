import { Hono } from "hono";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { areas } from "../../db/schema";

export const getSingleArea = new Hono().get(":id", async (c) => {
  const id = parseInt(c.req.param("id"));

  if (!id) {
    return c.json({ error: "ID is required" }, 400);
  }

  const result = await db.query.areas.findFirst({
    where: eq(areas.id, id),
    columns: {
      id: true,
      weight: true,
      parentId: true,
    },
    with: {
      translations: {
        columns: {
          id: true,
          title: true,
          subtitle: true,
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
      area_media: {
        columns: {
          mediaId: true,
        },
        with: {
          media: {
            columns: {
              id: true,
              type: true,
            },
          },
        },
      },
    },
  });

  if (!result) {
    return c.json({ area: null });
  }

  const { area_media, ...areaData } = result;

  const area = {
    ...areaData,
    images: area_media
      .filter((m) => m.media.type === "image")
      .map((m) => m.mediaId),
    audio: area_media.find((m) => m.media.type === "audio")?.mediaId || null,
  };

  return c.json({ area });
});
