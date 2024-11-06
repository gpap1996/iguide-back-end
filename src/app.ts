import "dotenv/config";
import { Hono } from "hono";
import { getAreas, createArea } from "./areaRepository";
const app = new Hono();

app.get("/", (c) => {
  return c.json({
    msg: "TON HONO",
  });
});

app.get("/areas/:id?", async (c) => {
  const id = Number(c.req.param("id"));
  const res = await getAreas(id);
  return c.json(res);
});

app.post("/area", async (c) => {
  const area = await c.req.json();
  const res = await createArea(area);
  return c.json(res);
});

export { app };
