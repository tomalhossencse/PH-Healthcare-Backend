import { Router } from "express";
import { DoctorController } from "./doctor.controller";
import { upload } from "../../lib/multer";
import {
	validateRequest,
	validateRequestForApplyDoctor,
} from "../../middleware/validateRequest";
import {
	applyAsDoctorZodSchema,
	approveDoctorValidationSchema,
	DoctorVerifyZodSchema,
	UpdateDoctorProfileValidationZodSchema,
} from "./doctor.validation";
import { auth } from "../../middleware/checkAuth";

const router = Router();

router.post(
	"/apply-doctor",
	upload.fields([
		{ name: "resume", maxCount: 1 },
		{ name: "additionalFiles", maxCount: 5 },
	]),
	validateRequestForApplyDoctor(applyAsDoctorZodSchema),
	DoctorController.applyAsDoctor,
);

router.post(
	"/verify-email",
	validateRequest(DoctorVerifyZodSchema),
	DoctorController.verifyDoctor,
);

router.patch(
	"/approve-doctor",
	validateRequest(approveDoctorValidationSchema),
	auth("ADMIN", "SUPER_ADMIN"),
	DoctorController.approveDoctor,
);

router.get(
	"/all-doctors",
	auth("ADMIN", "SUPER_ADMIN"),
	DoctorController.getAllDoctors,
);

router.patch(
	"/update-my-profile",
	auth("DOCTOR"),
	validateRequest(UpdateDoctorProfileValidationZodSchema),
	DoctorController.updateDoctorProfile,
);

// Public doctor-discovery routes (no auth) — meant for patients browsing before login.
router.get(
	"/public/available-today",
	DoctorController.getAvailableDoctorByTodaysSchedule,
);

router.get("/public/all-doctors", DoctorController.getAllDoctorsListPublic);

router.get("/public/:doctorId", DoctorController.getSingleDoctorPublicProfile);

export const DoctorRoutes = router;
