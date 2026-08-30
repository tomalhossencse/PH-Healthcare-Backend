import { NextFunction, Request, Response } from "express";
import { ZodObject } from "zod";
import { catchAsync } from "../utils/catchAsync";
import httpStatus from "http-status";
import { AppError } from "../utils/AppError";

export const validateRequest = (zodSchema: ZodObject) => {
	return catchAsync((req: Request, res: Response, next: NextFunction) => {
		const payload = zodSchema.safeParse(req.body);
		if (!payload.success) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				payload.error.issues[0].message,
			);
		}
		req.body = payload.data;
		next();
	});
};

export const validateRequestForApplyDoctor = (zodSchema: ZodObject) => {
	return catchAsync((req: Request, res: Response, next: NextFunction) => {
		const rawData = JSON.parse(req.body.data);
		const payload = zodSchema.safeParse(rawData);
		if (!payload.success) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				payload.error.issues[0].message,
			);
		}
		req.body = payload.data;
		next();
	});
};
