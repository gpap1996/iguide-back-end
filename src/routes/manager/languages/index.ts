import { Hono } from "hono";
import { getLanguages } from "./getLanguages";
import { createLanguage } from "./createLanguage";
import { updateLanguage } from "./updateLanguage";

const languageRoutes = new Hono();

languageRoutes.route("/", getLanguages);
languageRoutes.route("/", createLanguage);
languageRoutes.route("/", updateLanguage);

export { languageRoutes };
