import { db } from "./database";
import { AreaUpdate, Area, NewArea } from "./types";

export async function findAreaById(id: number) {
  return await db
    .selectFrom("areas")
    .where("id", "=", id)
    .selectAll()
    .executeTakeFirst();
}
