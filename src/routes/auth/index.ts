import { Hono } from "hono";
import { authVerifyLogin } from "./verifyLogin";

const authRoutes = new Hono();

authRoutes.route("/", authVerifyLogin);

export { authRoutes };
