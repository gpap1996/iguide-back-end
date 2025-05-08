import { pgTable, integer, serial, text, timestamp } from "drizzle-orm/pg-core";
import { areas } from "./areas";
import { languages } from "./languages";
import { relations } from "drizzle-orm";

export const area_translations = pgTable("area_translations", {
  id: serial("id").primaryKey(),
  areaId: integer("area_id")
    .notNull()
    .references(() => areas.id, { onDelete: "cascade" }),
  languageId: integer("language_id")
    .notNull()
    .references(() => languages.id, { onDelete: "cascade" }),
  title: text("title"),
  subtitle: text("subtitle"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const areaTranslationRelations = relations(
  area_translations,
  ({ one }) => ({
    area: one(areas, {
      fields: [area_translations.areaId],
      references: [areas.id],
    }),
    language: one(languages, {
      fields: [area_translations.languageId],
      references: [languages.id],
    }),
  })
);
