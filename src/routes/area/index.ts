import { Hono } from "hono";
import { getAreas } from "./getArea";
import { createArea } from "./createArea";
import { deleteArea } from "./deleteArea";
import { getAreasDropdown } from "./getAreaDropdown";
const areaRoutes = new Hono();

areaRoutes.route("/", getAreas);
areaRoutes.route("/", createArea);
areaRoutes.route("/", deleteArea);
areaRoutes.route("/", getAreasDropdown);

export { areaRoutes };
