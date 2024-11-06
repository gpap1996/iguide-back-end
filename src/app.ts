import "dotenv/config";
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({
    msg: "TON HONO",
  });
});

export { app };
