import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { external_file_translations } from "./external_file_translations";
import { relations } from "drizzle-orm";
import { projects } from "./projects";

export const external_files = pgTable("external_files", {
  name: text("name").notNull(),
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  url: text("url").notNull(),
  projectId: integer("project_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const externalFilesRelations = relations(
  external_files,
  ({ one, many }) => ({
    translations: many(external_file_translations),
    project: one(projects, {
      fields: [external_files.projectId],
      references: [projects.id],
    }),
  })
);
