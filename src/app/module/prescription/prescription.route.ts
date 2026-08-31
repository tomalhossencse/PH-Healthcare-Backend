import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { PrescriptionController } from "./prescription.controller";
import { CreatePrescriptionValidationZodSchema } from "./prescription.validation";

const router = Router();

router.post(
	"/create-prescription",
	auth("DOCTOR"),
	validateRequest(CreatePrescriptionValidationZodSchema),
	PrescriptionController.createPrescription,
);

router.get(
	"/:appointmentId",
	auth("PATIENT", "DOCTOR", "ADMIN", "SUPER_ADMIN"),
	PrescriptionController.getSinglePrescription,
);

export const PrescriptionRoutes = router;
