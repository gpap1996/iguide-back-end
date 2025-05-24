import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { file_translations } from "./file_translations";
import { relations } from "drizzle-orm";
import { projects } from "./projects";

export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  thumbnailPath: text("thumbnail_path"),
  projectId: integer("project_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const filesRelations = relations(files, ({ one, many }) => ({
  translations: many(file_translations),
  project: one(projects, {
    fields: [files.projectId],
    references: [projects.id],
  }),
}));
