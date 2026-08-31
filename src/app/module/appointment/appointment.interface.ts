import { AppointmentWhereInput } from "../../../generated/prisma/models";

export interface IBookAppointment {
	scheduleId: string;
}

export interface IPayAppointment {
	appointmentId: string;
}

export interface IUpdateAppointment {
	status: "ONGOING" | "COMPLETED";
}

export interface IAppointmentQuery extends AppointmentWhereInput {
	searchTerm?: string;
	page?: string;
	limit?: string;
	sortBy?: string;
	sortOrder?: string;
	patientEmail?: string;
	doctorEmail?: string;
	specialization?: string;
}
