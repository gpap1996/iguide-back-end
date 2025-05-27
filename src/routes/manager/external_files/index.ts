import { Hono } from "hono";
import { getExternalFiles } from "./getExternalFiles";

const externalFileRoutes = new Hono();

externalFileRoutes.route("/", getExternalFiles);

export { externalFileRoutes };
