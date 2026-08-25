import { Router } from "express";
import { DoctorController } from "./doctor.controller";
import { upload } from "../../lib/multer";
import {
	validationRequest,
	validationRequestForApplyDoctor,
} from "../../middleware/validateRequest";
import {
	applyAsDoctorZodSchema,
	DoctorVerifyZodSchema,
} from "./doctor.validation";

const router = Router();

router.post(
	"/apply-doctor",
	upload.fields([
		{ name: "resume", maxCount: 1 },
		{ name: "additionalFiles", maxCount: 5 },
	]),
	validationRequestForApplyDoctor(applyAsDoctorZodSchema),
	DoctorController.applyAsDoctor,
);

router.post(
	"/verify-email",
	validationRequest(DoctorVerifyZodSchema),
	DoctorController.verifyDoctor,
);

export const DoctorRoutes = router;
