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
  parent_id: number | null;
  weight: number | null;
  created_at: ColumnType<string, never, never>;
  updated_at: ColumnType<string, never, never>;
}

export type Area = Selectable<AreaTable>;
export type NewArea = Insertable<AreaTable>;
export type AreaUpdate = Updateable<AreaTable>;

export interface UserTable {
  id: Generated<number>;
  user_id: string;
  username: string | null;
  role: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  nationality: string;
  country_of_residence: string;
  created_at: ColumnType<string, never, never>;
  updated_at: ColumnType<string, never, never>;
}

export type User = Selectable<UserTable>;
export type NewUser = Insertable<UserTable>;
export type UserUpdate = Updateable<UserTable>;
