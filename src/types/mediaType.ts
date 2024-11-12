import { ColumnType } from "kysely";

export interface MediaTable {
  id?: string;
  type: string;
  url: string;
  thumbnail_url?: string;
  created_at: ColumnType<string, never, never>;
  updated_at: ColumnType<string, never, never>;
}
