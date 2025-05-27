import { Hono } from "hono";
import { getExternalFiles } from "./getExternalFiles";
import { createExternalFile } from "./createExternalFile";
import { updateExternalFile } from "./updateExternalFile";
import { deleteExternalFile } from "./deleteExternalFile";

const externalFileRoutes = new Hono();

externalFileRoutes.route("/", getExternalFiles);
externalFileRoutes.route("/", createExternalFile);
externalFileRoutes.route("/", updateExternalFile);
externalFileRoutes.route("/", deleteExternalFile);

export { externalFileRoutes };
