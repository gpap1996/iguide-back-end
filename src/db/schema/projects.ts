import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: boolean("status").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Define relations between projects and users
export const projectsRelations = relations(projects, ({ many }) => ({
  users: many(users),
}));

// Define the reverse relation in users schema
export const usersRelations = relations(users, ({ one }) => ({
  project: one(projects, {
    fields: [users.projectId],
    references: [projects.id],
  }),
}));
