import { auth } from "../../middleware/checkAuth";
import { AuthController } from "./auth.controller";
import { Role } from "../../../generated/prisma/enums";
import {
	ForgetPasswordZodSchema,
	LoginZodSchema,
	PataintRegZodSchema,
	PataintVerifyZodSchema,
	ResetPasswordZodSchema,
} from "./auth.validation";
import { Router } from "express";
import { validationRequest } from "../../middleware/validateRequest";

const router = Router();

router.post(
	"/register",
	validationRequest(PataintRegZodSchema),
	AuthController.registerPatient,
);
router.post(
	"/verify-email",
	validationRequest(PataintVerifyZodSchema),
	AuthController.verifyPatient,
);

router.post(
	"/login",
	validationRequest(LoginZodSchema),
	AuthController.loginUser,
);
router.get(
	"/me",
	auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),
	AuthController.getMe,
);
router.post("/refresh-token", AuthController.refreshToken);
router.post("/google", AuthController.googleLogin);
router.post(
	"/forget-password",
	validationRequest(ForgetPasswordZodSchema),
	AuthController.forgetPassword,
);
router.post(
	"/reset-password",
	validationRequest(ResetPasswordZodSchema),
	AuthController.resetPassword,
);

export const AuthRoutes = router;
