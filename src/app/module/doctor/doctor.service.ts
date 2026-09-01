import { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import { cloudinary } from "../../lib/cloudinary";
import bcrypt from "bcryptjs";
import config from "../../config";
import {
	IApplyAsDoctorPayload,
	IApproveDoctorPayload,
	IDoctorQuery,
	IUpdateDoctorProfilePayload,
	IVerifyDoctorPayload,
} from "./doctor.interface";
import crypto from "crypto";
import { radisClient } from "../../lib/radis";
import path from "path";
import ejs from "ejs";
import { transporter } from "../../lib/nodemailer";
import { RequestUser } from "../../middleware/checkAuth";
import { DoctorWhereInput } from "../../../generated/prisma/models";
import { AppError } from "../../utils/AppError";
import httpStatus from "http-status";
import { addDays, startOfDay } from "date-fns";

const applyAsDoctor = async (
	payload: IApplyAsDoctorPayload,
	resume: Express.Multer.File | null,
	additionalFiles: Express.Multer.File[],
) => {
	const isUserExist = await prisma.user.findUnique({
		where: {
			email: payload.user.email,
		},
	});

	if (isUserExist) {
		throw new AppError(
			httpStatus.CONFLICT,
			"User already exists with this email",
		);
	}

	const resumeUploadResult = await new Promise<UploadApiResponse>(
		(reslove, reject) => {
			cloudinary.uploader
				.upload_stream({ resource_type: "auto" }, async (error, result) => {
					if (error) {
						console.log(error);
						throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
					}

					if (!result) {
						return reject(
							new AppError(
								httpStatus.INTERNAL_SERVER_ERROR,
								"No result return from cloudinary",
							),
						);
					}

					reslove(result);
				})
				.end(resume?.buffer);
		},
	);

	const additionalFilesUploadResult = await Promise.all(
		additionalFiles.map((file) => {
			return new Promise<UploadApiResponse>((reslove, reject) => {
				cloudinary.uploader
					.upload_stream({ resource_type: "auto" }, async (error, result) => {
						if (error) {
							console.log(error);
							throw new AppError(
								httpStatus.INTERNAL_SERVER_ERROR,
								error.message,
							);
						}

						if (!result) {
							return reject(
								new AppError(
									httpStatus.INTERNAL_SERVER_ERROR,
									"No result return from cloudinary",
								),
							);
						}

						reslove(result);
					})
					.end(file?.buffer);
			});
		}),
	);

	const randomPassword = Math.random().toString(36).slice(-8);

	const hashPassword = await bcrypt.hash(
		randomPassword,
		Number(config.bcrypt_salt_rounds),
	);

	const doctorApplication = await prisma.user.create({
		data: {
			password: hashPassword,
			role: "DOCTOR",
			needPasswordChange: true,
			...payload.user,

			doctor: {
				create: {
					name: payload.user.name,
					email: payload.user.email,
					...payload.doctor,
					resume: resumeUploadResult.secure_url,
					resumePublicId: resumeUploadResult.public_id,
					additionalFiles: additionalFilesUploadResult.map((file) => ({
						url: file.secure_url,
						publicId: file.public_id,
					})),
				},
			},
		},
		include: {
			doctor: true,
		},
	});

	const otpKey = `doctor-application-otp:${payload.user.email}`;
	const otpValue = crypto.randomInt(100000, 1000000).toString();

	const expirationSeconds = 60 * 60;

	await radisClient.set(otpKey, otpValue, {
		expiration: {
			type: "EX",
			value: expirationSeconds,
		},
	});

	const templatePath = path.join(
		process.cwd(),
		"src/app/templates/registration-otp.ejs",
	);

	const templateData = {
		name: payload.user.name,
		otp: otpValue,
		expirationMinutes: expirationSeconds / 60,
	};

	const html = await ejs.renderFile(templatePath, templateData);

	await transporter.sendMail({
		from: config.email_sender,
		to: payload.user.email,
		subject: "Verify Your Account - PH Healthcare System",
		html,
	});

	return doctorApplication;
};

const verifyDoctor = async (payload: IVerifyDoctorPayload) => {
	const otp = payload.otp;

	const email = payload.email.trim().toLowerCase();

	const isUserExist = await prisma.user.findUnique({
		where: { email, role: "DOCTOR" },
	});

	if (!isUserExist) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Doctor Application not found. Please apply again",
		);
	}

	if (isUserExist?.emailVerified) {
		throw new AppError(
			httpStatus.CONFLICT,
			"User with this email already exists",
		);
	}

	if (isUserExist?.status === "BLOCKED") {
		throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
	}

	if (isUserExist?.isDeleted || isUserExist?.status === "DELETED") {
		throw new AppError(httpStatus.NOT_FOUND, "User is deleted");
	}

	if (isUserExist?.emailVerified) {
		throw new AppError(httpStatus.CONFLICT, "Your Email already verified");
	}

	const otpKey = `doctor-application-otp:${email}`;

	const redisOtp = await radisClient.get(otpKey);

	if (!redisOtp) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP");
	}

	if (redisOtp !== otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "OTP does not match");
	}

	await radisClient.del(otpKey);

	const verifiedUser = await prisma.user.update({
		where: {
			email: isUserExist?.email,
		},
		data: {
			emailVerified: true,
		},
		omit: { password: true },
		include: { doctor: true },
	});

	return verifiedUser;
};

const approveDoctor = async (
	payload: IApproveDoctorPayload,
	reviewer: RequestUser,
) => {
	const { doctorId, verificationStatus, rejectReason } = payload;

	const existingDoctor = await prisma.doctor.findUnique({
		where: {
			id: doctorId,
		},
		include: { user: true },
	});

	if (!existingDoctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Application Not Found");
	}

	if (existingDoctor.isDeleted) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Doctor application has been Deleted",
		);
	}

	if (!existingDoctor.user.emailVerified) {
		throw new AppError(httpStatus.BAD_REQUEST, "Doctor is not Verified yet");
	}

	if (existingDoctor.verificationStatus !== "PENDING") {
		throw new AppError(
			httpStatus.CONFLICT,
			`Doctor application is already been ${existingDoctor.verificationStatus.toLowerCase()}`,
		);
	}

	if (verificationStatus === "REJECTED" && !rejectReason) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Rejected Reason is Required when rejecting a doctor applicaton",
		);
	}

	const updatedDoctor = await prisma.doctor.update({
		where: {
			id: doctorId,
		},
		data: {
			verificationStatus,
			rejectionReason: verificationStatus === "REJECTED" ? rejectReason : null,
			reviewedBy: reviewer.userId,
			reviewedAt: new Date(),
		},
	});

	const isApproved = verificationStatus === "APPROVED";

	const templatePath = path.join(
		process.cwd(),
		`src/app/templates/${isApproved ? "doctor-application-approved.ejs" : "doctor-application-reject.ejs"}`,
	);

	const templateData = {
		name: updatedDoctor.name,
		reason: updatedDoctor.rejectionReason,
	};

	const html = await ejs.renderFile(templatePath, templateData);

	await transporter.sendMail({
		from: config.email_sender,
		to: updatedDoctor.email,
		subject: isApproved
			? "Doctor Verification Approved - PH Healthcare System"
			: "Doctor Verification Rejected - PH Healthcare System",
		html,
	});

	return updatedDoctor;
};

const getAllDoctors = async (query: IDoctorQuery) => {
	const limit = query.limit ? Number(query.limit) : 5;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const andConditions: DoctorWhereInput[] = [];

	// searching
	if (query.searchTerm) {
		andConditions.push({
			// searching
			OR: [
				{
					name: {
						contains: query.searchTerm,
						mode: "insensitive",
					},
				},
				{
					email: {
						contains: query.searchTerm,
						mode: "insensitive",
					},
				},
				{
					specialization: {
						contains: query.searchTerm,
						mode: "insensitive",
					},
				},
				{
					licenseNumber: {
						contains: query.searchTerm,
						mode: "insensitive",
					},
				},
			],
		});
	}

	// filtering
	if (query.specialization) {
		andConditions.push({
			specialization: {
				equals: query.specialization as string,
				mode: "insensitive",
			},
		});
	}

	if (query.licenseNumber) {
		andConditions.push({
			licenseNumber: {
				equals: query.licenseNumber as string,
				mode: "insensitive",
			},
		});
	}

	if (query.verificationStatus) {
		andConditions.push({
			verificationStatus: query.verificationStatus,
		});
	}

	andConditions.push({
		isDeleted: false,
	});

	const doctors = await prisma.doctor.findMany({
		where: {
			AND: andConditions,
		},
		// pagination
		take: limit,
		skip: skip,
		//sorting
		orderBy: {
			[sortBy]: sortOrder,
		},

		include: {
			user: {
				omit: {
					password: true,
				},
			},
		},
	});

	const totalDoctorCount = await prisma.doctor.count({
		where: {
			AND: andConditions,
		},
	});

	return {
		data: doctors,
		meta: {
			limit,
			page,
			total: totalDoctorCount,
			totalPages: Math.ceil(totalDoctorCount / limit),
		},
	};
};

const updateDoctorProfile = async (
	payload: IUpdateDoctorProfilePayload,
	user: RequestUser,
) => {
	const existingDoctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!existingDoctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}

	const updatedDoctor = await prisma.doctor.update({
		where: { id: existingDoctor.id },
		data: payload,
	});

	return updatedDoctor;
};

// Fields safe to expose on the public (unauthenticated) doctor-discovery endpoints.
// Deliberately excludes resume/additionalFiles, verification review metadata, and
// anything relation/auth related (user, userId, isDeleted, deletedAt...).

const getAvailableDoctorByTodaysSchedule = async (query: IDoctorQuery) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const now = new Date();
	const startOfToday = startOfDay(now);
	const startOfNextDay = addDays(startOfToday, 1);

	// A doctor is "available today" if they have at least one published,
	// not-yet-started schedule today with open slots left.

	const andConditions: DoctorWhereInput[] = [
		{ isDeleted: false },
		{ verificationStatus: "APPROVED" },
		{
			schedules: {
				some: {
					isDeleted: false,
					status: "PUBLISHED",
					availableSlots: { gt: 0 },
					startDateTime: {
						gte: startOfToday,
						lt: startOfNextDay,
						gt: now,
					},
				},
			},
		},
	];

	if (query.searchTerm) {
		andConditions.push({
			OR: [
				{ name: { contains: query.searchTerm, mode: "insensitive" } },
				{ specialization: { contains: query.searchTerm, mode: "insensitive" } },
			],
		});
	}

	if (query.specialization) {
		andConditions.push({
			specialization: query.specialization,
		});
	}

	const availableDoctors = await prisma.doctor.findMany({
		where: {
			AND: andConditions,
		},

		take: limit,
		skip,

		orderBy: {
			[sortBy]: sortOrder,
		},

		select: {
			id: true,
			name: true,
			specialization: true,
			licenseNumber: true,
			qualifications: true,
			experienceYears: true,
			bio: true,
			consultationFee: true,
			createdAt: true,
			schedules: {
				where: {
					isDeleted: false,
					status: "PUBLISHED",
					availableSlots: { gt: 0 },
					startDateTime: {
						gte: startOfToday,
						lt: startOfNextDay,
						gt: now,
					},
				},
				orderBy: { [sortBy]: sortOrder },
				select: {
					id: true,
					startDateTime: true,
					endDateTime: true,
					availableSlots: true,
					totalSlots: true,
				},
			},
		},
	});

	const totalAvailableDoctorCount = await prisma.doctor.count({
		where: { AND: andConditions },
	});

	return {
		data: availableDoctors,
		meta: {
			page,
			limit,
			total: totalAvailableDoctorCount,
			totalPages: Math.ceil(totalAvailableDoctorCount / limit),
		},
	};
};

const getAllDoctorsListPublic = async (query: IDoctorQuery) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const andConditions: DoctorWhereInput[] = [
		{ isDeleted: false },
		{ verificationStatus: "APPROVED" },
	];

	if (query.searchTerm) {
		andConditions.push({
			OR: [
				{ name: { contains: query.searchTerm, mode: "insensitive" } },
				{ specialization: { contains: query.searchTerm, mode: "insensitive" } },
				{ qualifications: { contains: query.searchTerm, mode: "insensitive" } },
			],
		});
	}

	if (query.specialization) {
		andConditions.push({
			specialization: query.specialization,
		});
	}

	const allDoctors = await prisma.doctor.findMany({
		where: {
			AND: andConditions,
		},

		take: limit,
		skip,

		orderBy: {
			[sortBy]: sortOrder,
		},

		select: {
			id: true,
			name: true,
			specialization: true,
			licenseNumber: true,
			qualifications: true,
			experienceYears: true,
			bio: true,
			consultationFee: true,
			createdAt: true,
		},
	});

	const totalDoctorCount = await prisma.doctor.count({
		where: { AND: andConditions },
	});

	return {
		data: allDoctors,
		meta: {
			page,
			limit,
			total: totalDoctorCount,
			totalPages: Math.ceil(totalDoctorCount / limit),
		},
	};
};

const getSingleDoctorPublicProfile = async (doctorId: string) => {
	const doctor = await prisma.doctor.findUnique({
		where: {
			id: doctorId,
			isDeleted: false,
			verificationStatus: "APPROVED",
		},
		select: {
			id: true,
			name: true,
			specialization: true,
			licenseNumber: true,
			qualifications: true,
			experienceYears: true,
			bio: true,
			consultationFee: true,
			createdAt: true,
		},
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Not Found");
	}

	return doctor;
};

export const DoctorService = {
	applyAsDoctor,
	verifyDoctor,
	approveDoctor,
	getAllDoctors,
	updateDoctorProfile,
	getAvailableDoctorByTodaysSchedule,
	getAllDoctorsListPublic,
	getSingleDoctorPublicProfile,
};
