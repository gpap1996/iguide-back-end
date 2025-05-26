import { Hono } from "hono";
import { getProjects } from "./getProjects";
import { createProject } from "./createProject";
import { updateProject } from "./updateProject";

const projectRoutes = new Hono();

projectRoutes.route("/", getProjects);
projectRoutes.route("/", createProject);
projectRoutes.route("/", updateProject);

export { projectRoutes };
