import { Hono } from "hono";
import firebaseAuth from "../../firebaseAuth";
import { db } from "../../db/database";
import { requiresAuth } from "../../middleware/requiresAuth";
// import { User, NewUser } from "../../types";

export const authVerifyLogin = new Hono();

authVerifyLogin.get("/verify-login", async (c) => {
  const jwt = c.req.header("Authorization")?.split(" ")[1];
  const decodedToken = await firebaseAuth.verifyIdToken(jwt || "");
  const { uid, email } = decodedToken;

  // Try to retrieve the user from the database
  let user = await db
    .selectFrom("users")
    .selectAll()
    .where("id", "=", uid)
    .executeTakeFirst();

  // If the user does not exist, insert a new one
  if (!user) {
    user = await db
      .insertInto("users")
      .values({ id: uid, email, role: "guest" })
      .returningAll()
      .executeTakeFirstOrThrow();
    console.log("New user created:", user);

    // Set custom claims for the new user
    await setCustomClaims(uid, { userWritten: true });
    await setCustomClaims(uid, { role: "guest" });
  } else {
    console.log("Existing user found:", user);
  }

  // Return the user data as the response
  return c.json(user);
});

async function setCustomClaims(uid: string, claims: object | null) {
  try {
    await firebaseAuth.setCustomUserClaims(uid, claims);
    console.log("Custom claims set:", claims);
  } catch (error) {
    console.error("Error setting custom claims:", error);
  }
}
