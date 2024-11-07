import { Hono } from "hono";
import { getAreas } from "./getArea";
import { createArea } from "./createArea";

const areaRoutes = new Hono();

areaRoutes.route("/", getAreas);
areaRoutes.route("/", createArea);

export { areaRoutes };
