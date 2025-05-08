import {
  pgTable,
  serial,
  timestamp,
  integer,
  AnyPgColumn,
} from "drizzle-orm/pg-core";
import { area_translations } from "./area_translations";
import { relations } from "drizzle-orm";

export const areas = pgTable("areas", {
  id: serial("id").primaryKey(),
  parentId: integer("parent_id").references((): AnyPgColumn => areas.id),
  weight: integer("weight"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const areaRelations = relations(areas, ({ many }) => ({
  translations: many(area_translations),
}));
