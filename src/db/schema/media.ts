import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { media_translations } from "./media_translations";
import { relations } from "drizzle-orm";

export const media = pgTable("media", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const mediaRelations = relations(media, ({ many }) => ({
  translations: many(media_translations),
}));
