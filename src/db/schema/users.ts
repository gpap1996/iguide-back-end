import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username"),
  role: text().notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text().notNull(),
  nationality: text(),
  countryOfResidence: text("country_of_residence"),
  projectId: integer("project_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
