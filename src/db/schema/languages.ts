import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const languagesTable = pgTable("languages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  locale: text("locale").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
