import { db } from "./database";
import { AreaUpdate, Area, NewArea } from "./types";

export async function getAreas(id: number | void) {
  console.log("areas", id);
  if (id)
    return await db
      .selectFrom("areas")
      .where("id", "=", id)
      .selectAll()
      .executeTakeFirst();
  else return await db.selectFrom("areas").selectAll().execute();
}

export async function createArea(area: NewArea) {
  return await db
    .insertInto("areas")
    .values(area)
    .returningAll()
    .executeTakeFirstOrThrow();
}
