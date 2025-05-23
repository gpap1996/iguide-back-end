import { Hono } from "hono";
import { createFile } from "./createFile";
import { updateFile } from "./updateFile";
import { deleteFile } from "./deleteFile";
import { getFiles } from "./getFiles";
import { getFilesDropdown } from "./getFilesDropdown";

const fileRoutes = new Hono();

fileRoutes.route("/", getFilesDropdown);
fileRoutes.route("/", getFiles);
fileRoutes.route("/", createFile);
fileRoutes.route("/", updateFile);
fileRoutes.route("/", deleteFile);

export { fileRoutes };
