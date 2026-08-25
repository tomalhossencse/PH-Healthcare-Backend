import { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import { cloudinary } from "../../lib/cloudinary";
import bcrypt from "bcryptjs";
import config from "../../config";
import {
	IApplyAsDoctorPayload,
	IVerifyDoctorPayload,
} from "./doctor.interface";
import crypto from "crypto";
import { radisClient } from "../../lib/radis";
import path from "path";
import ejs from "ejs";
import { transporter } from "../../lib/nodemailer";

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
		throw new Error("User already exists with this email");
	}

	const resumeUploadResult = await new Promise<UploadApiResponse>(
		(reslove, reject) => {
			cloudinary.uploader
				.upload_stream({ resource_type: "auto" }, async (error, result) => {
					if (error) {
						console.log(error);
						throw new Error(error.message);
					}

					if (!result) {
						return reject(new Error("No result return from cloudinary"));
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
							throw new Error(error.message);
						}

						if (!result) {
							return reject(new Error("No result return from cloudinary"));
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
		throw new Error("Doctor Application not found. Please apply again");
	}

	if (isUserExist?.emailVerified) {
		throw new Error("User with this email already exists");
	}

	if (isUserExist?.status === "BLOCKED") {
		throw new Error("User is blocked");
	}

	if (isUserExist?.isDeleted || isUserExist?.status === "DELETED") {
		throw new Error("User is deleted");
	}

	if (isUserExist?.emailVerified) {
		throw new Error("Your Email already verified");
	}

	const otpKey = `doctor-application-otp:${email}`;

	const redisOtp = await radisClient.get(otpKey);

	if (!redisOtp) {
		throw new Error("Invalid OTP");
	}

	if (redisOtp !== otp) {
		throw new Error("OTP does not match");
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

export const DoctorService = {
	applyAsDoctor,
	verifyDoctor,
};
