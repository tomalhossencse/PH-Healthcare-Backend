import { catchAsync } from "../../utils/catchAsync";
import httpStatus from "http-status";
import { sendResponse } from "../../utils/sendResponse";
import { Request, Response } from "express";
import { AppointmentService } from "./appointement.service";

const bookAppointment = catchAsync(async (req: Request, res: Response) => {
	const result = await AppointmentService.bookAppointment();
	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Payment create Successfully",
		data: result,
	});
});

const bookAppointmentCallback = catchAsync(
	async (req: Request, res: Response) => {
		const { redirectUrl } = await AppointmentService.bookAppointmentCallback(
			req.query,
		);

		res.redirect(redirectUrl);
	},
);

export const AppointmentController = {
	bookAppointment,
	bookAppointmentCallback,
};
