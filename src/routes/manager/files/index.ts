import { Hono } from "hono";
import { createFile } from "./createFile";
import { createFiles } from "./createFiles";
import { updateFile } from "./updateFile";
import { deleteFile } from "./deleteFile";
import { deleteFiles } from "./deleteFiles";
import { getFiles } from "./getFiles";
import { getFilesDropdown } from "./getFilesDropdown";
import { exportFilesToExcel } from "./exportFilesToExcel";
import { importFilesFromExcel } from "./importFilesFromExcel";

const fileRoutes = new Hono();

// Routes - use route() for all routes
fileRoutes.route("/dropdown", getFilesDropdown);
fileRoutes.route("/", getFiles);
fileRoutes.route("/", createFile);
fileRoutes.route("/mass-delete", deleteFiles);
fileRoutes.route("/mass-upload", createFiles);
fileRoutes.route("/export-excel", exportFilesToExcel);
fileRoutes.route("/import-excel", importFilesFromExcel);
fileRoutes.route("/", updateFile);
fileRoutes.route("/", deleteFile);

export { fileRoutes };
