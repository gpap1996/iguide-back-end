import { Hono } from "hono";
import { db } from "@/db";
import { languages } from "@/db/schema/languages";
import { requiresAdmin } from "@/middleware/requiresAdmin";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const schema = z.object({
  name: z.string({ required_error: "Language name is required" }),
  locale: z.string({ required_error: "Language code is required" }),
});

export const createLanguage = new Hono().post(
  "/",
  requiresAdmin,
  zValidator("json", schema),
  async (c) => {
    const language = c.req.valid("json");
    const res = await db.insert(languages).values(language);

    return c.json(res);
  }
);
