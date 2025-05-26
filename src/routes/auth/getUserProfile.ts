import { Hono } from "hono";
import { requiresAuth } from "../../middleware/requiresAuth";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { users } from "../../db/schema";

const app = new Hono();

export const getUserProfile = app.get("/", requiresAuth, async (c) => {
  const currentUser = c.get("currentUser");

  const user = await db.query.users.findFirst({
    where: eq(users.id, currentUser.user_id),
    with: {
      project: true,
    },
  });

  return c.json({
    user,
  });
});
