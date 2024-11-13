import { ColumnType } from "kysely";

export interface TranslationTable {
  id?: string;
  entity_type: string;
  entity_id: string;
  field: string;
  field_value: string;
  language_id: string;
  created_at: ColumnType<string, never, never>;
  updated_at: ColumnType<string, never, never>;
}
