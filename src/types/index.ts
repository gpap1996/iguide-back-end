import { AreaTable } from "./areaType";
import { UserTable } from "./userType";
import { MediaTable, MediaTranslationsTable } from "./mediaType";
import { LanguageTable } from "./languageType";

export interface Database {
  users: UserTable;
  languages: LanguageTable;
  media: MediaTable;
  media_translations: MediaTranslationsTable;
  areas: AreaTable;
}
