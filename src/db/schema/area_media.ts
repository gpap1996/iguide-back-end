import { pgTable, integer, serial, text, timestamp } from "drizzle-orm/pg-core";
import { media } from "./media";
import { areas } from "./areas";
import { relations } from "drizzle-orm";

export const area_media = pgTable("area_media", {
  id: serial("id").primaryKey(),
  mediaId: integer("media_id")
    .notNull()
    .references(() => media.id, { onDelete: "cascade" }),
  areaId: integer("area_id")
    .notNull()
    .references(() => areas.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const areaMediaRelations = relations(area_media, ({ one }) => ({
  media: one(media, {
    fields: [area_media.mediaId],
    references: [media.id],
  }),
  area: one(areas, {
    fields: [area_media.areaId],
    references: [areas.id],
  }),
}));
