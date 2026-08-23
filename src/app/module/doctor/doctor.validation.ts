import { z } from "zod";

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
