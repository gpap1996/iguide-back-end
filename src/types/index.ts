import { AreaTable } from "./areaType";
import { UserTable } from "./userType";
import { MediaTable } from "./mediaType";

export interface Database {
  areas: AreaTable;
  users: UserTable;
  media: MediaTable;
}
