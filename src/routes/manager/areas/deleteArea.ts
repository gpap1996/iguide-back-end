import { Hono } from "hono";
import { areas } from "@/db/schema";
import { db } from "@/db";
import { eq } from "drizzle-orm";

export const deleteArea = new Hono().delete("/:id", async (c) => {
  const areaId = parseInt(c.req.param("id"));

  if (!areaId) {
    return c.json({ error: "Area ID is required" }, 400);
  }

  try {
    await db.delete(areas).where(eq(areas.id, areaId)).execute();
    return c.json({ message: `Area with ID ${areaId} deleted successfully` });
  } catch (error) {
    console.error("Error deleting area:", error);
    return c.json({ error: "Failed to delete area" }, 500);
  }
});
