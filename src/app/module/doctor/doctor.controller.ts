import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { DoctorService } from "./doctor.service";

const applyAsDoctor = catchAsync(async (req: Request, res: Response) => {
	const files = req.files as { [fieldname: string]: Express.Multer.File[] };
	const resume = files?.["resume"] ? files?.["resume"][0] : null;

	const additionalFiles = files?.["additionalFiles"] || [];

	const result = await DoctorService.applyAsDoctor(
		req.body,
		resume,
		additionalFiles,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Apply for doctor successfully",
		data: result,
	});
});

const verifyDoctor = catchAsync(async (req: Request, res: Response) => {
	const result = await DoctorService.verifyDoctor(req.body);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Doctor verified successfully.",
		data: result,
	});
});

export const DoctorController = {
	applyAsDoctor,
	verifyDoctor,
};
