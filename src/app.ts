import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { HTTPException } from "hono/http-exception";
import { authRoutes } from "./routes/auth";
import { areaRoutes } from "./routes/area";
import { mediaRoutes } from "./routes/media";
import { serveStatic } from "@hono/node-server/serve-static";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: "*",
  })
);

app.use("/media/*", serveStatic({ root: "./" }));

app
  .basePath("/api")
  .route("/auth", authRoutes)
  .route("/area", areaRoutes)
  .route("/media", mediaRoutes);

// app.onError((err, c) => {
//   if (err instanceof HTTPException) {
//     return err.getResponse();
//   }

//   console.error(err);

//   return c.text("Something went wrong", 500);
// });

export { app };
