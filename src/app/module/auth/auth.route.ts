import { auth } from "../../middleware/checkAuth";
import { AuthController } from "./auth.controller";
import { Role } from "../../../generated/prisma/enums";
import { LoginZodSchema, PataintRegZodSchema } from "./auth.validation";
import { Router } from "express";
import { validationRequest } from "../../middleware/validateRequest";

const router = Router();

router.post(
	"/register",
	validationRequest(PataintRegZodSchema),
	AuthController.registerPatient,
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

export const AuthRoutes = router;
