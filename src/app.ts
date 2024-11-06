import "dotenv/config";
import { Hono } from "hono";
import { findAreaById } from "./areaRepository";
const app = new Hono();

app.get("/", (c) => {
  return c.json({
    msg: "TON HONO",
  });
});

app.get("/areas/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const res = await findAreaById(id);
  return c.text(`Area: ${res}`);

  return c.json({
    msg: "TON HONO",
  });
});

export { app };
