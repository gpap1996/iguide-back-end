import { projects } from "./projects";
import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username"),
  role: text().notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: text().notNull().notNull().unique(),
  nationality: text(),
  countryOfResidence: text("country_of_residence"),
  projectId: integer("project_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const usersRelations = relations(users, ({ one }) => ({
  project: one(projects, {
    fields: [users.projectId],
    references: [projects.id],
  }),
}));
