import { ColumnType } from "kysely";
import { TranslationTable } from "./translationType";
interface Translation {
  field: "title" | "description";
  field_value: string;
  locale: string;
}
export interface MediaTable {
  id?: string;
  type: string;
  url: string;
  thumbnail_url?: string;
  translations?: Translation[];
  created_at: ColumnType<string, never, never>;
  updated_at: ColumnType<string, never, never>;
}
