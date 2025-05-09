import { Hono } from "hono";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { areas } from "../../db/schema";

export const getSingleArea = new Hono().get(":id", async (c) => {
  const id = parseInt(c.req.param("id"));

  if (!id) {
    return c.json({ error: "ID is required" }, 400);
  }

  let [result] = await db.query.areas.findMany({
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

  let area = null;
  if (result) {
    const images = result.area_media
      .filter((m) => m.media.type === "image")
      .map((m) => m.mediaId);

    const audio = result.area_media.find(
      (m) => m.media.type === "audio"
    )?.mediaId;

    // Transform the result and exclude area_media
    area = {
      id: result.id,
      parentId: result?.parentId,
      weight: result.weight,
      translations: result.translations,
      images,
      audio,
    };
  }

  return c.json({
    area: area,
  });
});
