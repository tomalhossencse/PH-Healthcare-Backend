import config from "../config";

export const getCookieOptions = (maxAge?: number) => ({
	httpOnly: true,
	secure: config.node_env !== "development", // true in production
	sameSite: (config.node_env === "development" ? "lax" : "none") as
		| "lax"
		| "none",
	path: "/",
	...(maxAge ? { maxAge } : {}),
});
