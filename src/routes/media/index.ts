import { Hono } from "hono";
import { createMedia } from "./createMedia";

const mediaRoutes = new Hono();

mediaRoutes.route("/", createMedia);

export { mediaRoutes };
