import { Router } from "express";
import { AppointmentController } from "./appointment.controller";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { UpdateAppointmentStatusValidationZodSchema } from "./appointment.validation";

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

router.post(
	"/cancel-appointment",
	auth("PATIENT", "ADMIN", "SUPER_ADMIN"),
	AppointmentController.cancelAppointment,
);

router.get(
	"/book-appointment/payment/callback",
	AppointmentController.bookAppointmentCallback,
);

router.patch(
	"/update-status/:appointmentId",
	auth("DOCTOR"),
	validateRequest(UpdateAppointmentStatusValidationZodSchema),
	AppointmentController.updateAppointmentStatus,
);

router.get(
	"/my-appointments",
	auth("PATIENT"),
	AppointmentController.getMyAppointments,
);

router.get(
	"/doctor-appointments",
	auth("DOCTOR"),
	AppointmentController.getDoctorAppointments,
);

router.get(
	"/all-appointments",
	auth("ADMIN", "SUPER_ADMIN"),
	AppointmentController.getAllAppointments,
);

router.get(
	"/:appointmentId",
	auth("PATIENT", "DOCTOR", "ADMIN", "SUPER_ADMIN"),
	AppointmentController.getSingleAppointment,
);

export const AppointmentRoutes = router;
