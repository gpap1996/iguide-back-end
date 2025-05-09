import { Hono } from "hono";
import { createMedia } from "./createMedia";
import { updateMedia } from "./updateMedia";
import { deleteMedia } from "./deleteMedia";
import { getMedia } from "./getMedia";
import { getMediaDropdown } from "./getMediaDropdown";

const mediaRoutes = new Hono();

mediaRoutes.route("/", getMediaDropdown);
mediaRoutes.route("/", getMedia);
mediaRoutes.route("/", createMedia);
mediaRoutes.route("/", updateMedia);
mediaRoutes.route("/", deleteMedia);

export { mediaRoutes };
