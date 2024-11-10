import { ColumnType } from "kysely";

export interface UserTable {
  id: string;
  username: string | null;
  role: string;
  first_name: string | null;
  last_name: string | null;
  email?: string;
  nationality?: string;
  country_of_residence?: string;
  created_at: ColumnType<string, never, never>;
  updated_at: ColumnType<string, never, never>;
}
