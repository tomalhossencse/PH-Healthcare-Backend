import { Router } from "express";
import { DoctorController } from "./doctor.controller";
import { upload } from "../../lib/multer";
import { validationRequestForApplyDoctor } from "../../middleware/validateRequest";
import { applyAsDoctorZodSchema } from "./doctor.validation";

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

export const DoctorRoutes = router;
