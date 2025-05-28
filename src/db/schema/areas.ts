import {
  pgTable,
  serial,
  timestamp,
  integer,
  AnyPgColumn,
} from "drizzle-orm/pg-core";
import { area_translations } from "./area_translations";
import { area_files } from "./area_files";
import { relations } from "drizzle-orm";
import { projects } from "./projects";
import { area_external_files } from "./area_external_files";
export const areas = pgTable("areas", {
  id: serial("id").primaryKey(),
  parentId: integer("parent_id").references((): AnyPgColumn => areas.id),
  weight: integer("weight"),
  projectId: integer("project_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const areaRelations = relations(areas, ({ one, many }) => ({
  translations: many(area_translations),
  area_files: many(area_files),
  area_external_files: many(area_external_files),
  parent: one(areas, {
    fields: [areas.parentId],
    references: [areas.id],
    relationName: "parent",
  }),
  project: one(projects, {
    fields: [areas.projectId],
    references: [projects.id],
  }),
}));
