import { pgTable, integer, serial, text, timestamp } from "drizzle-orm/pg-core";
import { media } from "./media";
import { languages } from "./languages";
import { relations } from "drizzle-orm";

export const media_translations = pgTable("media_translations", {
  id: serial("id").primaryKey(),
  mediaId: integer("media_id")
    .notNull()
    .references(() => media.id, { onDelete: "cascade" }),
  languageId: integer("language_id")
    .notNull()
    .references(() => languages.id, { onDelete: "cascade" }),
  title: text("title"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const mediaTranslationsRelations = relations(
  media_translations,
  ({ one }) => ({
    media: one(media, {
      fields: [media_translations.mediaId],
      references: [media.id],
    }),
    language: one(languages, {
      fields: [media_translations.languageId],
      references: [languages.id],
    }),
  })
);
