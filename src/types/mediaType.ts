import { ColumnType } from "kysely";

export interface MediaTable {
  id?: string;
  title: string;
  description?: string;
  type: string;
  url: string;
  created_at: ColumnType<string, never, never>;
  updated_at: ColumnType<string, never, never>;
}
