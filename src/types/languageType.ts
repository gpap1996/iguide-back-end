import { ColumnType } from "kysely";

export interface LanguageTable {
  id?: string;
  name: string;
  code: string;
  created_at: ColumnType<string, never, never>;
  updated_at: ColumnType<string, never, never>;
}
