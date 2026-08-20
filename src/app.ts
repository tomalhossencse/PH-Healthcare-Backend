import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
	type Application,
	type Request,
	type Response,
} from "express";
import httpStatus from "http-status";
import config from "./app/config";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { AuthRoutes } from "./app/module/auth/auth.route";
import z from "zod";
import { radisClient } from "./app/lib/radis";
import crypto from "crypto";
import { getBkashIdToken } from "./app/lib/bkash";
import { AppointmentRoutes } from "./app/module/appointment/appointment.route";

const app: Application = express();

app.use(
	cors({
		origin: config.frontend_url,
		credentials: true,
	}),
);

// Enable URL-encoded form data parsing
app.use(express.urlencoded({ extended: true }));

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cookieParser());

app.use("/api/v1/auth", AuthRoutes);
app.use("/api/v1/appointment", AppointmentRoutes);

// app.get("/test", async (req: Request, res: Response) => {
// 	try {
// 		const grandIdTokenResult = await getBkashIdToken();

// 		res.status(httpStatus.OK).json({
// 			success: true,
// 			message: "Welcome to PH Healthcare System Backend",
// 			data: { idToken: grandIdTokenResult },
// 		});
// 	} catch (error) {}
// });

// Basic route
app.get("/", async (req: Request, res: Response) => {
	res.status(httpStatus.OK).json({
		success: true,
		message: "Welcome to PH Healthcare System Backend",
	});
});

app.use(globalErrorHandler);
app.use(notFound);

export default app;
