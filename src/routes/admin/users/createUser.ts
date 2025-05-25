import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requiresAdmin } from "../../../middleware/requiresAdmin";
import firebaseAuth from "../../../firebaseAuth";
import { db } from "../../../db";
import { users } from "../../../db/schema";

const schema = z.object({
  username: z.string({ required_error: "Username is required" }),
  role: z.enum(["manager"]),
  firstName: z.string({ required_error: "First name is required" }),
  lastName: z.string({ required_error: "Last name is required" }),
  email: z
    .string({ required_error: "Email is required" })
    .email({ message: "Invalid email format" }),
  nationality: z.string().optional(),
  countryOfResidence: z.string().optional(),
  projectId: z.number({ required_error: "Project ID is required" }),
  password: z
    .string({
      required_error: "Password is required",
    })
    .min(5, "Password must be at least 5 characters long")
    .max(12, "Password must be at most 12 characters long")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one symbol"),
});

export const createUser = new Hono().post(
  "/",
  requiresAdmin,
  zValidator("json", schema),
  async (c) => {
    const user = c.req.valid("json");

    try {
      const userRecord = await firebaseAuth.createUser({
        email: user.email,
        password: user.password,
      });

      await firebaseAuth.setCustomUserClaims(userRecord.uid, {
        role: "manager",
        projectId: user.projectId,
        userWritten: true,
      });

      const newUser = {
        id: userRecord.uid,
        ...user,
      };

      const [result] = await db.insert(users).values(newUser).returning();

      return c.json(
        {
          user: result,
        },
        200
      );
    } catch (e) {
      console.error("Error creating user:", e);
      return c.json(
        {
          error: e,
          message: "Error creating user ",
        },
        400
      );
    }
  }
);
