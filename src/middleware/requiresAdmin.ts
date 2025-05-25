import { createMiddleware } from "hono/factory";
import firebaseAuth from "../firebaseAuth";
import { HTTPException } from "hono/http-exception";

declare module "hono" {
  interface ContextVariableMap {
    currentUser: { user_id: string; email: string; projectId?: number };
  }
}

export const requiresAdmin = createMiddleware(async (c, next) => {
  try {
    const jwt = c.req.header("Authorization")?.split(" ")[1]; // get jwt from headers

    const decoded = await firebaseAuth.verifyIdToken(jwt || ""); // verify jwt

    if (decoded.role !== "admin") {
      throw new HTTPException(401, {
        message: "Unauthorized",
      });
    }

    c.set("currentUser", {
      user_id: decoded.uid,
      email: decoded.email!,
    });

    await next();
  } catch (e) {
    throw new HTTPException(401, {
      message: "Unauthorized111",
    });
  }
});
