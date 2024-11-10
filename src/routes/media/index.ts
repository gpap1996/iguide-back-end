import { Hono } from "hono";
import { createMedia } from "./createMedia";
import { getMedia } from "./getMedia";

const mediaRoutes = new Hono();

mediaRoutes.route("/", createMedia);
mediaRoutes.route("/", getMedia);

export { mediaRoutes };
