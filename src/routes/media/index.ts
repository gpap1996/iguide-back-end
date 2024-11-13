import { Hono } from "hono";
import { createMedia } from "./createMedia";
import { updateMedia } from "./updateMedia";
import { deleteMedia } from "./deleteMedia";
import { getMedia } from "./getMedia";

const mediaRoutes = new Hono();

mediaRoutes.route("/", createMedia);
mediaRoutes.route("/", updateMedia);
mediaRoutes.route("/", deleteMedia);
mediaRoutes.route("/", getMedia);

export { mediaRoutes };
