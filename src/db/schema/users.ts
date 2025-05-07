import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username"),
  role: text().notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text().notNull(),
  nationality: text(),
  countryOfResidence: text("country_of_residence"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
