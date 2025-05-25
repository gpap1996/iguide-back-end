import { Hono } from "hono";
import firebaseAuth from "../../firebaseAuth";
import { db } from "../../db";
import { users } from "../../db/schema/users";
import { eq } from "drizzle-orm";

export const authVerifyLogin = new Hono();

authVerifyLogin.get("/verify-login", async (c) => {
  const jwt = c.req.header("Authorization")?.split(" ")[1];
  const decodedToken = await firebaseAuth.verifyIdToken(jwt || "");
  const { uid, email } = decodedToken;

  if (!uid) {
    return c.json({ error: "Invalid Firebase token (missing user ID)" }, 401);
  }

  if (!email) {
    return c.json({ error: "User has no email address" }, 400);
  }

  const [user] = await db.select().from(users).where(eq(users.id, uid));

  if (!user) {
    await db.insert(users).values({
      id: uid,
      email: email,
      role: "guest",
    });

    await setCustomClaims(uid, { userWritten: true });
    await setCustomClaims(uid, { role: "guest" });

    const [newUser] = await db.select().from(users).where(eq(users.id, uid));

    return c.json(newUser);
  }

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
