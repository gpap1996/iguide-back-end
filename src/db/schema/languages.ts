import { relations } from "drizzle-orm";
import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { projects } from "./projects";

export const languages = pgTable("languages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  locale: text("locale").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  projectId: integer("project_id").notNull(),
});

export const languagesRelations = relations(languages, ({ one }) => ({
  project: one(projects, {
    fields: [languages.projectId],
    references: [projects.id],
  }),
}));
