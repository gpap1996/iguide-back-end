import {
  ColumnType,
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from "kysely";

export interface Database {
  areas: AreaTable;
}

export interface AreaTable {
  id: Generated<number>;
  title: string;
  parent_id: number | null;
  weight: number | null;
  created_at: ColumnType<string, never, never>;
  updated_at: ColumnType<string, never, never>;
}

export type Area = Selectable<AreaTable>;
export type NewArea = Insertable<AreaTable>;
export type AreaUpdate = Updateable<AreaTable>;
