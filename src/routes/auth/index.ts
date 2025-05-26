import { Hono } from "hono";
import { authVerifyLogin } from "./verifyLogin";
import { getUserProfile } from "./getUserProfile";

const authRoutes = new Hono();

authRoutes.route("/user-profile", getUserProfile);
authRoutes.route("/", authVerifyLogin);

export { authRoutes };
