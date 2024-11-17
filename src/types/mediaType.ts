import { ColumnType } from "kysely";

export interface MediaTable {
  id?: string;
  type: string;
  url: string;
  thumbnail_url?: string;
  created_at: ColumnType<string, never, never>;
  updated_at: ColumnType<string, never, never>;
}

export interface MediaTranslationsTable {
  id?: string;
  media_id?: string;
  language_id?: string;
  title: string;
  description: string;
  created_at: ColumnType<string, never, never>;
  updated_at: ColumnType<string, never, never>;
}
