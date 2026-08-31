import { z } from "zod";
import { DoctorVerificationStatus } from "../../../generated/prisma/enums";

export const applyAsDoctorZodSchema = z.object({
	user: z.object({
		name: z.string("User name is required").min(1),
		email: z.string("Email is required").email("Invalid email format"),
	}),
	doctor: z.object({
		specialization: z.string("Specialization is required").min(1),
		licenseNumber: z.string("License number is required").min(1),
		qualifications: z.string("Qualifications are required").min(1),
		experienceYears: z
			.number("Experience years is required")
			.int("Experience years must be an integer")
			.nonnegative("Experience years cannot be negative"),
		bio: z.string().optional(),
		consultationFee: z.number().positive("Fee must be positive").optional(),
		contactNumber: z.string().optional(),
		address: z.string().optional(),
	}),
});

export const DoctorVerifyZodSchema = z.object({
	email: z.email(),
	otp: z.string().length(6, { message: "OTP must be exactly 6 characters" }),
});

export const approveDoctorValidationSchema = z.object({
	doctorId: z
		.string({
			error: "Doctor ID is required",
		})
		.min(1, "Doctor ID is required"),

	verificationStatus: z.enum(DoctorVerificationStatus, {
		error: "Verification status is required",
	}),

	rejectReason: z.string().optional(),
});

export const UpdateDoctorProfileValidationZodSchema = z.object({
	address: z
		.string()
		.trim()
		.min(5, "Address must be at least 5 characters long")
		.optional(),

	bio: z
		.string()
		.trim()
		.max(1000, "Bio cannot exceed 1000 characters")
		.optional(),

	consultationFee: z
		.number()
		.min(0, "Consultation fee cannot be negative")
		.optional(),

	contactNumber: z
		.string()
		.trim()
		.min(5, "Contact number is invalid")
		.optional(),
});
