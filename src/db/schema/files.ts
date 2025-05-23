import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { file_translations } from "./file_translations";
import { relations } from "drizzle-orm";

export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  fileName: text("file_name").notNull(),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const filesRelations = relations(files, ({ many }) => ({
  translations: many(file_translations),
}));
