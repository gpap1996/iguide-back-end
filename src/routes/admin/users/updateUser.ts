import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requiresAdmin } from "../../../middleware/requiresAdmin";
import firebaseAuth from "../../../firebaseAuth";
import { db } from "../../../db";
import { users } from "../../../db/schema";
import { eq } from "drizzle-orm";

const schema = z.object({
  username: z.string({ required_error: "Username is required" }),
  role: z.enum(["manager"]),
  firstName: z.string({ required_error: "First name is required" }),
  lastName: z.string({ required_error: "Last name is required" }),
  email: z
    .string({ required_error: "Email is required" })
    .email({ message: "Invalid email format" }),
  nationality: z.string().optional().nullable(),
  countryOfResidence: z.string().optional().nullable(),
  projectId: z.number({ required_error: "Project ID is required" }),
  password: z
    .string()
    .min(5, "Password must be at least 5 characters long")
    .max(12, "Password must be at most 12 characters long")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one symbol")
    .optional()
    .nullable(),
});

export const updateUser = new Hono().put(
  "/:id",
  requiresAdmin,
  zValidator("json", schema),
  async (c) => {
    const user = c.req.valid("json");
    const userId = c.req.param("id");

    if (!userId) {
      return c.json(
        {
          error: "User ID is required",
          message: "Please provide a valid user ID.",
        },
        400
      );
    }

    try {
      const { customClaims } = await firebaseAuth.updateUser(userId, {
        email: user.email,
        password: user.password || undefined,
      });

      await firebaseAuth.setCustomUserClaims(userId, {
        ...customClaims,
        projectId: user.projectId,
      });

      const [result] = await db
        .update(users)
        .set(user)
        .where(eq(users.id, userId))
        .returning();

      return c.json(
        {
          user: result,
        },
        200
      );
    } catch (e) {
      console.error("Error updating user:", e);
      return c.json(
        {
          error: e,
          message: "Error updating user ",
        },
        400
      );
    }
  }
);
