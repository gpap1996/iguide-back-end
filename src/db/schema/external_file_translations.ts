import { pgTable, integer, serial, text, timestamp } from "drizzle-orm/pg-core";
import { external_files } from "./external_files";
import { languages } from "./languages";
import { relations } from "drizzle-orm";

export const external_file_translations = pgTable(
  "external_file_translations",
  {
    id: serial("id").primaryKey(),
    fileId: integer("file_id")
      .notNull()
      .references(() => external_files.id, { onDelete: "cascade" }),
    languageId: integer("language_id")
      .notNull()
      .references(() => languages.id, { onDelete: "cascade" }),
    title: text("title"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  }
);

export const externalFilesTranslationsRelations = relations(
  external_file_translations,
  ({ one }) => ({
    files: one(external_files, {
      fields: [external_file_translations.fileId],
      references: [external_files.id],
    }),
    language: one(languages, {
      fields: [external_file_translations.languageId],
      references: [languages.id],
    }),
  })
);
