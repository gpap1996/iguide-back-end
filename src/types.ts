import {
  ColumnType,
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from "kysely";

export interface Database {
  areas: AreaTable;
  users: UserTable;
}

export interface AreaTable {
  id: Generated<number>;
  title: string;
  desctiption: string;
  parent_id?: number;
  weight?: number;
  created_at: ColumnType<string, never, never>;
  updated_at: ColumnType<string, never, never>;
}

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
