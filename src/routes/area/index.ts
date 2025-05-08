import { Hono } from "hono";
import { getAreas } from "./getArea";
import { createArea } from "./createArea";
import { deleteArea } from "./deleteArea";

const areaRoutes = new Hono();

areaRoutes.route("/", getAreas);
areaRoutes.route("/", createArea);
areaRoutes.route("/", deleteArea);

export { areaRoutes };
