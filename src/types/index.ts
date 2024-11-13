import { AreaTable } from "./areaType";
import { UserTable } from "./userType";
import { MediaTable } from "./mediaType";
import { LanguageTable } from "./languageType";

import { TranslationTable } from "./translationType";

export interface Database {
  users: UserTable;
  languages: LanguageTable;
  translations: TranslationTable;
  media: MediaTable;
  areas: AreaTable;
}
