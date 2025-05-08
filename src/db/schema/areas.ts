import { pgTable, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { area_translations } from "./area_translations";
import { relations } from "drizzle-orm";

export const areas = pgTable("areas", {
  id: serial("id").primaryKey(),
  parentId: integer("parent_id").primaryKey(),
  weight: integer("weight").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const areaRelations = relations(areas, ({ many }) => ({
  translations: many(area_translations),
}));
