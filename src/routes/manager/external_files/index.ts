import { Hono } from "hono";
import { getExternalFiles } from "./getExternalFiles";
import { createExternalFile } from "./createExternalFile";
const externalFileRoutes = new Hono();

externalFileRoutes.route("/", getExternalFiles);
externalFileRoutes.route("/", createExternalFile);

export { externalFileRoutes };
