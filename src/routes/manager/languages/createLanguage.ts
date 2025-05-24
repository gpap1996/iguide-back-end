import { Hono } from "hono";
import { db } from "@/db";
import { languages } from "@/db/schema/languages";
import { requiresManager } from "@/middleware/requiresManager";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const schema = z.object({
  name: z.string({ required_error: "Language name is required" }),
  locale: z.string({ required_error: "Language code is required" }),
});

export const createLanguage = new Hono().post(
  "/",
  requiresManager,
  zValidator("json", schema),
  async (c) => {
    const currentUser = c.get("currentUser");
    const language = c.req.valid("json");

    if (!currentUser?.projectId) {
      return c.json({ error: "Project ID not found for current user" }, 400);
    }

    try {
      const [createdLanguage] = await db
        .insert(languages)
        .values({ ...language, projectId: currentUser.projectId })
        .returning();
      return c.json({
        message: "Language created successfully",
        language: createdLanguage,
      });
    } catch (e) {
      console.error("Error creating language:", e);
      return c.json({ error: e, message: "Error creating language" }, 500);
    }
  }
);
