import { Hono } from "hono";
import { db } from "../../../db";
import { and, eq } from "drizzle-orm";
import { areas } from "../../../db/schema";
import { requiresManager } from "../../../middleware/requiresManager";

export const getSingleArea = new Hono().get(
  ":id",
  requiresManager,
  async (c) => {
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
        area_files: {
          columns: {
            fileId: true,
          },
          with: {
            files: {
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

    const { area_files, ...areaData } = result;

    const area = {
      ...areaData,
      images: area_files
        .filter((m) => m.files.type === "image")
        .map((m) => m.fileId),
      audio: area_files
        .filter((m) => m.files.type === "audio")
        .map((m) => m.fileId),
    };

    return c.json({ area });
  }
);
