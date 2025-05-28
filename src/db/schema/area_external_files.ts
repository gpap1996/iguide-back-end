import { pgTable, integer, serial, timestamp } from "drizzle-orm/pg-core";
import { external_files } from "./external_files";
import { areas } from "./areas";
import { relations } from "drizzle-orm";

export const area_external_files = pgTable("area_external_files", {
  id: serial("id").primaryKey(),
  externalFileId: integer("external_file_id")
    .notNull()
    .references(() => external_files.id, { onDelete: "cascade" }),
  areaId: integer("area_id")
    .notNull()
    .references(() => areas.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const areaExternalFilesRelation = relations(
  area_external_files,
  ({ one }) => ({
    externalFiles: one(external_files, {
      fields: [area_external_files.externalFileId],
      references: [external_files.id],
    }),
    area: one(areas, {
      fields: [area_external_files.areaId],
      references: [areas.id],
    }),
  })
);
