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
import { validateRequest } from "../../middleware/validateRequest";
import { upload } from "../../lib/multer";

const router = Router();

router.post(
	"/register",
	validateRequest(PataintRegZodSchema),
	AuthController.registerPatient,
);
router.post(
	"/verify-email",
	validateRequest(PataintVerifyZodSchema),
	AuthController.verifyPatient,
);

router.post(
	"/login",
	validateRequest(LoginZodSchema),
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
	validateRequest(ForgetPasswordZodSchema),
	AuthController.forgetPassword,
);
router.post(
	"/reset-password",
	validateRequest(ResetPasswordZodSchema),
	AuthController.resetPassword,
);

router.patch(
	"/profile-image",
	auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),
	upload.single("image"),
	AuthController.uploadProfileImg,
);

router.post("/logout", AuthController.logout);

export const AuthRoutes = router;
