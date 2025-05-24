import { db } from "@/db";
import { users } from "@/db/schema";
import firebaseAuth from "@/firebaseAuth";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

export const deleteUser = new Hono().delete("/:id", async (c) => {
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
    firebaseAuth.deleteUser(userId);
    await db.delete(users).where(eq(users.id, userId));

    return c.json({
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return c.json(
      {
        error: "Internal Server Error",
        message: "An error occurred while deleting the user.",
      },
      500
    );
  }
});
