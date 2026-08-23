import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { DoctorService } from "./doctor.service";
import { file } from "zod";
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

export const DoctorController = {
	applyAsDoctor,
};
