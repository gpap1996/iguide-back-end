import { pgTable, integer, serial, timestamp } from "drizzle-orm/pg-core";
import { files } from "./files";
import { areas } from "./areas";
import { relations } from "drizzle-orm";

export const area_files = pgTable("area_files", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  areaId: integer("area_id")
    .notNull()
    .references(() => areas.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const areaFilesRelations = relations(area_files, ({ one }) => ({
  files: one(files, {
    fields: [area_files.fileId],
    references: [files.id],
  }),
  area: one(areas, {
    fields: [area_files.areaId],
    references: [areas.id],
  }),
}));
