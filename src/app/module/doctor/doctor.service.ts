import { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import { cloudinary } from "../../lib/cloudinary";
import bcrypt from "bcryptjs";
import config from "../../config";
import { IApplyAsDoctorPayload } from "./doctor.interface";

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

	return doctorApplication;
};

export const DoctorService = {
	applyAsDoctor,
};
