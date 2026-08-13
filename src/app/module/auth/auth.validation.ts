import z from "zod";

export const PataintRegZodSchema = z.object({
	name: z.string().min(3).max(20),
	email: z.email(),
	password: z
		.string()
		.min(6)
		.min(8, { message: "Password must be at least 8 characters long" })
		.regex(/[A-Z]/, { message: "Contain at least one uppercase letter" })
		.regex(/[a-z]/, { message: "Contain at least one lowercase letter" })
		.regex(/[0-9]/, { message: "Contain at least one number" })
		.regex(/[^A-Za-z0-9]/, {
			message: "Contain at least one special character",
		}),
});

export const LoginZodSchema = z.object({
	email: z.email(),
	password: z
		.string()
		.min(6)
		.min(8, { message: "Password must be at least 8 characters long" })
		.regex(/[A-Z]/, { message: "Contain at least one uppercase letter" })
		.regex(/[a-z]/, { message: "Contain at least one lowercase letter" })
		.regex(/[0-9]/, { message: "Contain at least one number" })
		.regex(/[^A-Za-z0-9]/, {
			message: "Contain at least one special character",
		}),
});

export const ForgetPasswordZodSchema = z.object({
	email: z.email(),
});

export const ResetPasswordZodSchema = z.object({
	email: z.email(),
	newPassword: z
		.string()
		.min(6)
		.min(8, { message: "Password must be at least 8 characters long" })
		.regex(/[A-Z]/, { message: "Contain at least one uppercase letter" })
		.regex(/[a-z]/, { message: "Contain at least one lowercase letter" })
		.regex(/[0-9]/, { message: "Contain at least one number" })
		.regex(/[^A-Za-z0-9]/, {
			message: "Contain at least one special character",
		}),
	otp: z.string().length(6, { message: "OTP must be exactly 6 characters" }),
});
