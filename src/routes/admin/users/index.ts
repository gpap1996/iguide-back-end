import { Hono } from "hono";
import { getUsers } from "./getUsers";
import { createUser } from "./createUser";
import { updateUser } from "./updateUser";
import { deleteUser } from "./deleteUser";

const userRoutes = new Hono();

userRoutes.route("/", getUsers);
userRoutes.route("/", createUser);
userRoutes.route("/", updateUser);
userRoutes.route("/", deleteUser);

export { userRoutes };
