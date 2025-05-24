import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { HTTPException } from "hono/http-exception";
import { authRoutes } from "./routes/auth";
import { languageRoutes } from "./routes/manager/languages";
import { fileRoutes } from "./routes/manager/files";
import { areaRoutes } from "./routes/manager/areas";
import { projectRoutes } from "./routes/admin/projects";

import { serveStatic } from "@hono/node-server/serve-static";

const app = new Hono();

app.get("/", (c) => c.text("Hono!"));

app.use(
  "/api/*",
  cors({
    origin: "*",
  })
);

app.use("/files/*", serveStatic({ root: "./" }));

app
  .basePath("/api")
  .route("/auth", authRoutes)
  .route("/languages", languageRoutes)
  .route("/files", fileRoutes)
  .route("/areas", areaRoutes)
  .route("/projects", projectRoutes);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  console.error(err);

  return c.text(`Something went wrong ${err}`, 500);
});

export { app };
