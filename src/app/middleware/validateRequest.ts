import { NextFunction, Request, Response } from "express";
import { ZodObject } from "zod";
import { catchAsync } from "../utils/catchAsync";

export const validationRequest = (zodSchema: ZodObject) => {
	return catchAsync((req: Request, res: Response, next: NextFunction) => {
		const payload = zodSchema.safeParse(req.body);
		if (!payload.success) {
			throw new Error(payload.error.issues[0].message);
		}
		req.body = payload.data;
		next();
	});
};
