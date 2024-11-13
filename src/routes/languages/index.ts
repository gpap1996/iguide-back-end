import { Hono } from "hono";
import { getLanguages } from "./getLanguages";
import { createLanguage } from "./createLanguage";

const languageRoutes = new Hono();

languageRoutes.route("/", getLanguages);
languageRoutes.route("/", createLanguage);

export { languageRoutes };
