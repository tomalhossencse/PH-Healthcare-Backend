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

const approveDoctor = catchAsync(async (req: Request, res: Response) => {
	const user = req.user!;
	const result = await DoctorService.approveDoctor(req.body, user);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: `Doctor ${result.verificationStatus} successfully.`,
		data: result,
	});
});

const getAllDoctors = catchAsync(async (req: Request, res: Response) => {
	const query = req.query;
	const { data, meta } = await DoctorService.getAllDoctors(query);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: `All Doctors Retrived Sucessfully`,
		data,
		meta,
	});
});

const updateDoctorProfile = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const user = req.user!;

	const result = await DoctorService.updateDoctorProfile(payload, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctor Profile Updated Successfully",
		data: result,
	});
});

const getAvailableDoctorByTodaysSchedule = catchAsync(
	async (req: Request, res: Response) => {
		const { data, meta } =
			await DoctorService.getAvailableDoctorByTodaysSchedule(req.query);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Today's Available Doctors Retrieved Successfully",
			data,
			meta,
		});
	},
);

const getAllDoctorsListPublic = catchAsync(
	async (req: Request, res: Response) => {
		const { data, meta } = await DoctorService.getAllDoctorsListPublic(
			req.query,
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Doctors Retrieved Successfully",
			data,
			meta,
		});
	},
);

const getSingleDoctorPublicProfile = catchAsync(
	async (req: Request, res: Response) => {
		const doctorId = req.params.doctorId as string;

		const result = await DoctorService.getSingleDoctorPublicProfile(doctorId);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Doctor Profile Retrieved Successfully",
			data: result,
		});
	},
);

export const DoctorController = {
	applyAsDoctor,
	verifyDoctor,
	approveDoctor,
	getAllDoctors,
	updateDoctorProfile,
	getAvailableDoctorByTodaysSchedule,
	getAllDoctorsListPublic,
	getSingleDoctorPublicProfile,
};
