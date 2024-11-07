import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { HTTPException } from "hono/http-exception";
import { authRoutes } from "./routes/auth";

const app = new Hono();
app.use(
  "/api/*",
  cors({
    origin: "*",
  })
);

app.basePath("/api").route("/auth", authRoutes);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  console.error(err);

  return c.text("Something went wrong", 500);
});

export { app };
