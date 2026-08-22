import { Router } from "express";
import { AppointmentController } from "./appointment.controller";
import { auth } from "../../middleware/checkAuth";

const router = Router();

router.post(
	"/book-appointment",
	auth("PATIENT"),
	AppointmentController.bookAppointment,
);

router.post(
	"/pay-appointment",
	auth("PATIENT"),
	AppointmentController.payAppointment,
);

router.get(
	"/book-appointment/payment/callback",
	AppointmentController.bookAppointmentCallback,
);

export const AppointmentRoutes = router;
