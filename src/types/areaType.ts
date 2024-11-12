import { ColumnType } from "kysely";

export interface AreaTable {
  id?: string;
  parent_id?: string;
  weight?: number;
  images?: Array<string>;
  sound?: string;
  created_at: ColumnType<string, never, never>;
  updated_at: ColumnType<string, never, never>;
}
