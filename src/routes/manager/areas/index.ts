import { Hono } from "hono";
import { getAreas } from "./getAreas";
import { getSingleArea } from "./getSingleArea";
import { createArea } from "./createArea";
import { deleteArea } from "./deleteArea";
import { getAreasDropdown } from "./getAreaDropdown";
import { updateArea } from "./updateArea";
const areaRoutes = new Hono();

areaRoutes.route("/", getAreasDropdown);
areaRoutes.route("/", getSingleArea);
areaRoutes.route("/", getAreas);
areaRoutes.route("/", createArea);
areaRoutes.route("/", updateArea);
areaRoutes.route("/", deleteArea);

export { areaRoutes };
