import { pgTable, integer, serial, text, timestamp } from "drizzle-orm/pg-core";
import { files } from "./files";
import { languages } from "./languages";
import { relations } from "drizzle-orm";

export const file_translations = pgTable("file_translations", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  languageId: integer("language_id")
    .notNull()
    .references(() => languages.id, { onDelete: "cascade" }),
  title: text("title"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const filesTranslationsRelations = relations(
  file_translations,
  ({ one }) => ({
    files: one(files, {
      fields: [file_translations.fileId],
      references: [files.id],
    }),
    language: one(languages, {
      fields: [file_translations.languageId],
      references: [languages.id],
    }),
  })
);
