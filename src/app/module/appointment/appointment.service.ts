import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import {
	IAppointmentQuery,
	IBookAppointment,
	IPayAppointment,
	IUpdateAppointment,
} from "./appointment.interface";
import { addMinutes, isBefore, isSameDay, subHours } from "date-fns";
import ejs from "ejs";
import { transporter } from "../../lib/nodemailer";
import path from "path";
import PDFDocument from "pdfkit";
import { AppointmentWhereInput } from "../../../generated/prisma/models";

const bookAppointment = async (
	payload: IBookAppointment,
	user: RequestUser,
) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		// appointment bussiness logic

		const patient = await prisma.patient.findUnique({
			where: {
				userId: user.userId,
			},
		});

		if (!patient) {
			throw new AppError(httpStatus.NOT_FOUND, "Patient Profile not found");
		}

		const schedule = await prisma.schedule.findUnique({
			where: {
				id: payload.scheduleId,
			},
			include: {
				doctor: true,
			},
		});

		if (!schedule || schedule.isDeleted) {
			throw new AppError(httpStatus.NOT_FOUND, "Schedule not found");
		}

		if (schedule.status !== "PUBLISHED") {
			throw new Error("This schedule is not published yet");
		}

		const now = new Date();

		// if (!isSameDay(now, schedule.startDateTime)) {
		// 	throw new Error("This Schedule is Not Available Today");
		// }

		if (!isBefore(now, schedule.startDateTime)) {
			throw new Error("This Schedule is already started");
		}

		const existingAppointment = await prisma.appointment.findFirst({
			where: {
				patientId: patient.id,
				scheduleId: schedule.id,
			},
		});

		if (existingAppointment?.status === "PENDING") {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"You already have a pendig Appointment",
			);
		}

		if (existingAppointment?.status === "CONFIRMED") {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"You already have a confirmed Appointment",
			);
		}

		if (existingAppointment?.status === "ONGOING") {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"You already have a ongoing Appointment",
			);
		}

		if (existingAppointment?.status === "COMPLETED") {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"You already have a completed an appointment on this schedule.Please try again another day",
			);
		}

		if (schedule.availableSlots === 0) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"This Schedule is fully booked",
			);
		}

		if (!schedule.doctor.consultationFee) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Doctor not set a consultation fee yet",
			);
		}

		const amount = schedule.doctor.consultationFee.toString();

		const appointment = await tx.appointment.create({
			data: {
				status: "PENDING",
				patientId: patient.id,
				doctorId: schedule.doctor.id,
				scheduleId: schedule.id,
			},
		});

		// bkash bussiness logic
		const bkashIdToken = await getBkashIdToken();

		if (!bkashIdToken) {
			throw new AppError(
				httpStatus.BAD_GATEWAY,
				"Bkash access token not found",
			);
		}

		const bkashCreatePaymentRes = await fetch(
			`${config.bkash_base_url}/tokenized/checkout/create`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					authorization: bkashIdToken,
					"x-app-key": config.bkash_app_key,
				},
				body: JSON.stringify({
					agreementID: "TokenizedMerchant01L3IKB6H1565072174986",
					mode: "0011",
					payerReference: "01770618575",
					// payerReference: user.email,
					callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
					merchantAssociationInfo: "MI05MID54RF09123456One",
					amount: amount,
					currency: "BDT",
					intent: "sale",
					// merchantInvoiceNumber: "Inv02",
					merchantInvoiceNumber: appointment.id,
				}),
			},
		);

		const bkashCreatePaymentResult = await bkashCreatePaymentRes.json();

		// console.log({ bkashCreatePaymentResult });

		// payment model create
		await tx.payment.create({
			data: {
				merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
				appointmentId: appointment.id,
				amount: bkashCreatePaymentResult.amount,
				currency: bkashCreatePaymentResult.currency,
				gatwayRespone: bkashCreatePaymentResult,
				paymentID: bkashCreatePaymentResult.paymentID,
				payerReference: user.email,
			},
		});

		return { paymentUrl: bkashCreatePaymentResult.bkashURL };
	});

	return transactionResult;
};

const payAppointment = async (payload: IPayAppointment, user: RequestUser) => {
	const appointmentId = payload.appointmentId;

	const existingAppointment = await prisma.appointment.findUnique({
		where: {
			id: appointmentId,
		},
		include: {
			schedule: {
				include: {
					doctor: true,
				},
			},
		},
	});

	if (!existingAppointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment is not exists");
	}

	if (existingAppointment.status !== "PENDING") {
		throw new AppError(httpStatus.BAD_REQUEST, "Appointment is not pending");
	}

	// if (
	// 	existingAppointment.status === "CANCELLED" ||
	// 	existingAppointment.status === "ONGOING" ||
	// 	existingAppointment.status === "COMPLETED"
	// ) {
	// 	throw new Error(
	// 		`Appointment is already ${existingAppointment.status.toLowerCase()}`,
	// 	);
	// }
	// bkash bussiness logic

	if (!existingAppointment.schedule.doctor.consultationFee) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Doctor not set a consultation fee yet",
		);
	}
	const amount = existingAppointment.schedule.doctor.consultationFee.toString();
	const bkashIdToken = await getBkashIdToken();

	if (!bkashIdToken) {
		throw new AppError(httpStatus.BAD_GATEWAY, "Bkash access token not found");
	}

	const bkashCreatePaymentRes = await fetch(
		`${config.bkash_base_url}/tokenized/checkout/create`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				authorization: bkashIdToken,
				"x-app-key": config.bkash_app_key,
			},
			body: JSON.stringify({
				agreementID: "TokenizedMerchant01L3IKB6H1565072174986",
				mode: "0011",
				payerReference: "01770618575",
				// payerReference: user.email,
				callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
				merchantAssociationInfo: "MI05MID54RF09123456One",
				amount,
				currency: "BDT",
				intent: "sale",
				// merchantInvoiceNumber: "Inv02",
				merchantInvoiceNumber: existingAppointment.id,
			}),
		},
	);

	const bkashCreatePaymentResult = await bkashCreatePaymentRes.json();

	// payment model update
	await prisma.payment.update({
		where: {
			appointmentId: existingAppointment.id,
		},
		data: {
			merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
			gatwayRespone: bkashCreatePaymentResult,
			paymentID: bkashCreatePaymentResult.paymentID,
		},
	});

	return { paymentUrl: bkashCreatePaymentResult.bkashURL };
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
	const transactionResult = await prisma.$transaction(
		async (tx) => {
			const paymentId = query.paymentID;
			if (!paymentId) {
				throw new AppError(httpStatus.BAD_REQUEST, "PaymentId is missing");
			}
			const status = query.status;
			if (!status) {
				throw new AppError(httpStatus.BAD_REQUEST, "Payment Status is missing");
			}

			const bkashIdToken = await getBkashIdToken();

			if (!bkashIdToken) {
				throw new AppError(
					httpStatus.BAD_GATEWAY,
					"Bkash access token not found",
				);
			}

			const bkashExecutedPaymentRes = await fetch(
				`${config.bkash_base_url}/tokenized/checkout/execute`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
						authorization: bkashIdToken,
						"x-app-key": config.bkash_app_key,
					},
					body: JSON.stringify({
						paymentID: paymentId,
					}),
				},
			);

			const bkashExecutedPaymentResult = await bkashExecutedPaymentRes.json();

			if (status === "success") {
				const appointment = await prisma.appointment.findUnique({
					where: {
						id: bkashExecutedPaymentResult.merchantInvoiceNumber,
					},
					include: {
						schedule: true,
						patient: true,
						doctor: true,
					},
				});

				if (!appointment) {
					throw new AppError(httpStatus.NOT_FOUND, "Appointment not found");
				}

				const newAvailableSlots = appointment.schedule.availableSlots - 1;

				const alreadyBookedSlots =
					appointment.schedule.totalSlots - appointment.schedule.availableSlots;

				const serialNumber = alreadyBookedSlots + 1;

				const joiningTime = addMinutes(
					appointment.schedule.startDateTime,
					(serialNumber - 1) * 20,
				);

				await tx.appointment.update({
					where: {
						id: bkashExecutedPaymentResult.merchantInvoiceNumber,
					},
					data: {
						status: "CONFIRMED",
						serialNumber,
						joiningTime,
					},
				});

				await tx.schedule.update({
					where: {
						id: appointment.schedule.id,
					},
					data: {
						availableSlots: newAvailableSlots,
					},
				});

				await tx.payment.update({
					where: {
						appointmentId: bkashExecutedPaymentResult.merchantInvoiceNumber,
						paymentID: paymentId,
					},
					data: {
						status: "PAID",
						trxID: bkashExecutedPaymentResult.trxID,
						paidAt: bkashExecutedPaymentResult.paymentExecuteTime,
						gatwayRespone: bkashExecutedPaymentResult,
					},
				});

				// make pdf

				const pdfDocument = new PDFDocument({ margin: 50 });

				const pdfChuncks: Buffer[] = [];

				pdfDocument.on("data", (chunk: Buffer) => {
					pdfChuncks.push(chunk);
				});

				const pdfReadyPromise = new Promise<Buffer>((reslove) => {
					pdfDocument.on("end", () => {
						reslove(Buffer.concat(pdfChuncks));
					});
				});

				pdfDocument
					.fontSize(20)
					.text("PH Healthcare System", { align: "center" });

				pdfDocument
					.fontSize(14)
					.text("Appointment Invoice", { align: "center" });
				pdfDocument.moveDown(2);

				pdfDocument
					.fontSize(12)
					.text(`Patient Name : ${appointment.patient.name}`);
				pdfDocument
					.fontSize(12)
					.text(`Patient Email : ${appointment.patient.email}`);
				pdfDocument.moveDown(2);

				pdfDocument.text(`Doctor Name : ${appointment.doctor.name}`);
				pdfDocument.text(`Doctor Specialization : ${appointment.doctor.email}`);
				pdfDocument.moveDown(2);

				pdfDocument.text(
					`Appointment Date  : ${appointment.schedule.startDateTime.toDateString()}`,
				);

				pdfDocument.text(`Your Joining Time: ${joiningTime.toString()}`);
				pdfDocument.text(`Your Serial Number : ${serialNumber}`);
				pdfDocument.text(`Meeting Link : ${appointment.schedule.meetingLink}`);
				pdfDocument.moveDown(2);

				pdfDocument.text(
					`Amount Paid: ${bkashExecutedPaymentResult.amount} BDT`,
				);
				pdfDocument.text(`Payment Method: Bkash`);
				pdfDocument.text(`Transaction Id: ${bkashExecutedPaymentResult.trxID}`);
				pdfDocument.text(
					`Paid At: ${bkashExecutedPaymentResult.paymentExecuteTime}`,
				);

				pdfDocument.end();

				const pdfBuffer = await pdfReadyPromise;

				// send email

				const templatePath = path.join(
					process.cwd(),
					`src/app/templates/patient-payment-invoice.ejs`,
				);

				const templateData = {
					name: appointment.patient.name,
					invoiceDate: bkashExecutedPaymentResult.paymentExecuteTime,
					invoiceNumber: bkashExecutedPaymentResult.merchantInvoiceNumber,
					amount: bkashExecutedPaymentResult.amount,
				};

				const html = await ejs.renderFile(templatePath, templateData);

				await transporter.sendMail({
					from: config.email_sender,
					to: appointment.patient.email,
					subject: "Your Appointment Invoice - PH Healthcare System",
					html,
					attachments: [{ filename: "invoice.pdf", content: pdfBuffer }],
				});

				return {
					redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
				};
			} else if (status === "failure") {
				await tx.payment.update({
					where: {
						paymentID: paymentId,
					},
					data: {
						status: "FAILED",
						gatwayRespone: bkashExecutedPaymentResult,
					},
				});

				return {
					redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
				};
			} else if (status === "cancel") {
				await tx.payment.update({
					where: {
						paymentID: paymentId,
					},
					data: {
						status: "CANCELLED",
						gatwayRespone: bkashExecutedPaymentResult,
					},
				});
				return {
					redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
				};
			} else {
				return {
					redirectUrl: `${config.frontend_url}/dashboard/my-appointments?error=payment-failed`,
				};
			}
		},
		{
			maxWait: 5000,
			timeout: 30000,
		},
	);

	return transactionResult;
};

const cancelAppointment = async (payload: IPayAppointment) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		const appointmentId = payload.appointmentId;

		const existingAppointment = await tx.appointment.findUnique({
			where: {
				id: appointmentId,
			},
			include: {
				payment: true,
				schedule: true,
			},
		});

		console.log(existingAppointment);

		if (!existingAppointment) {
			throw new AppError(httpStatus.NOT_FOUND, "Appointment is not exists");
		}

		if (
			existingAppointment.status === "ONGOING" ||
			existingAppointment.status === "COMPLETED"
		) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Ongoing or completed appointments cannot be cancelled",
			);
		}

		const updatedAppointment = await tx.appointment.update({
			where: {
				id: existingAppointment.id,
			},
			data: {
				status: "CANCELLED",
			},
		});

		await tx.schedule.update({
			where: {
				id: existingAppointment.schedule.id,
			},
			data: {
				availableSlots: { increment: 1 },
			},
		});

		// refund process

		const now = new Date();

		const startDateTime = existingAppointment.schedule.startDateTime;
		// 2.00pm => 1.00pm
		const refundCutOffTime = subHours(startDateTime, 1);

		const isEligibleForRefund = isBefore(now, refundCutOffTime);

		if (isEligibleForRefund) {
			const bkashIdToken = await getBkashIdToken();

			if (!bkashIdToken) {
				throw new AppError(
					httpStatus.BAD_GATEWAY,
					"Bkash access token not found",
				);
			}
			const bkashRefundPaymentRes = await fetch(
				`${config.bkash_base_url}/tokenized/checkout/payment/refund`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
						authorization: bkashIdToken,
						"x-app-key": config.bkash_app_key,
					},
					body: JSON.stringify({
						paymentID: existingAppointment.payment?.paymentID,
						trxID: existingAppointment.payment?.trxID,
						amount: existingAppointment.payment?.amount?.toString(),
						sku: "Appointment Cancellation",
						reason: "Patient cancelled the appointment",
					}),
				},
			);

			const bkashRefundPaymentResult = await bkashRefundPaymentRes.json();

			await tx.payment.update({
				where: {
					appointmentId: existingAppointment.id,
				},
				data: {
					status: "REFUNDED",
					refundTrxId: bkashRefundPaymentResult.refundTrxID,
					refundedAt: bkashRefundPaymentResult.completedTime,
					refundAmount: bkashRefundPaymentResult.amount,
					refundReason: "Patient cancelled the appointment",
					gatwayRespone: bkashRefundPaymentResult,
				},
			});
		}

		const newPaymentInfo = await prisma.payment.findUnique({
			where: {
				appointmentId: existingAppointment.id,
			},
		});

		return {
			appointment: updatedAppointment,
			payment: newPaymentInfo,
		};
	});

	return transactionResult;
};

// doctor only
const updateAppointmentStatus = async (
	appointmentId: string,
	payload: IUpdateAppointment,
	user: RequestUser,
) => {
	const doctor = await prisma.doctor.findUnique({
		where: {
			userId: user.userId,
		},
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile not exists");
	}

	const appointment = await prisma.appointment.findUnique({
		where: {
			id: appointmentId,
			doctorId: doctor.id,
		},
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment not found");
	}

	if (appointment.status === "COMPLETED") {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Appointment is already completed",
		);
	}

	if (appointment.status === "CANCELLED") {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Appointment is already cancelled",
		);
	}

	if (appointment.status === "PENDING") {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Appointment is pending.You can change after confirmed",
		);
	}

	if (appointment.status === "CONFIRMED") {
		if (payload.status !== "ONGOING") {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Confirmed Appointment must be ongoing at first",
			);
		}

		await prisma.appointment.update({
			where: {
				id: appointmentId,
			},
			data: {
				status: "ONGOING",
			},
		});
	}

	if (appointment.status === "ONGOING") {
		if (payload.status !== "COMPLETED") {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Confirmed Appointment must be completed here",
			);
		}

		await prisma.appointment.update({
			where: {
				id: appointmentId,
			},
			data: {
				status: "COMPLETED",
			},
		});
	}

	const updatedAppointment = await prisma.appointment.findUnique({
		where: {
			id: appointmentId,
		},
	});

	return updatedAppointment;
};

// patient appointments
const getMyAppointments = async (
	query: IAppointmentQuery,
	user: RequestUser,
) => {
	const patient = await prisma.patient.findUnique({
		where: {
			userId: user.userId,
		},
	});

	if (!patient) {
		throw new AppError(httpStatus.NOT_FOUND, "Patient Profile not found");
	}

	const limit = query.limit ? Number(query.limit) : 5;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";
	const andConditions: AppointmentWhereInput[] = [
		{
			patient: {
				userId: user.userId,
			},
		},
	];

	// filtering
	if (query.doctorEmail) {
		andConditions.push({
			doctor: {
				email: query.doctorEmail,
			},
		});
	}

	if (query.specialization) {
		andConditions.push({
			doctor: {
				specialization: { equals: query.specialization, mode: "insensitive" },
			},
		});
	}

	if (query.status) {
		andConditions.push({
			status: query.status,
		});
	}

	const appointments = await prisma.appointment.findMany({
		where: { AND: andConditions },
		// pagination
		take: limit,
		skip,
		// sorting
		orderBy: {
			[sortBy]: sortOrder,
		},
	});

	const totalAppointmentCount = await prisma.appointment.count({
		where: {
			AND: andConditions,
		},
	});

	return {
		data: appointments,
		meta: {
			limit,
			page,
			total: totalAppointmentCount,
			totalPages: Math.ceil(totalAppointmentCount / limit),
		},
	};
};

// doctor appointments
const getDoctorAppointments = async (
	query: IAppointmentQuery,
	user: RequestUser,
) => {
	const doctor = await prisma.doctor.findUnique({
		where: {
			userId: user.userId,
		},
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile not found");
	}

	const limit = query.limit ? Number(query.limit) : 5;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";
	const andConditions: AppointmentWhereInput[] = [
		{
			doctor: {
				userId: user.userId,
			},
		},
	];

	// filtering
	if (query.patientEmail) {
		andConditions.push({
			patient: {
				email: query.patientEmail,
			},
		});
	}

	if (query.status) {
		andConditions.push({
			status: query.status,
		});
	}

	const appointments = await prisma.appointment.findMany({
		where: { AND: andConditions },
		// pagination
		take: limit,
		skip,
		// sorting
		orderBy: {
			[sortBy]: sortOrder,
		},
	});

	const totalAppointmentCount = await prisma.appointment.count({
		where: {
			AND: andConditions,
		},
	});

	return {
		data: appointments,
		meta: {
			limit,
			page,
			total: totalAppointmentCount,
			totalPages: Math.ceil(totalAppointmentCount / limit),
		},
	};
};

// get for super admin or admin
const getAllAppointments = async (query: IAppointmentQuery) => {
	const limit = query.limit ? Number(query.limit) : 5;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";
	const andConditions: AppointmentWhereInput[] = [];

	// filtering
	if (query.patientEmail) {
		andConditions.push({
			patient: {
				email: query.patientEmail,
			},
		});
	}

	if (query.doctorEmail) {
		andConditions.push({
			doctor: {
				email: query.doctorEmail,
			},
		});
	}

	if (query.specialization) {
		andConditions.push({
			doctor: {
				specialization: query.specialization,
			},
		});
	}

	if (query.status) {
		andConditions.push({
			status: query.status,
		});
	}

	const appointments = await prisma.appointment.findMany({
		where: { AND: andConditions },
		// pagination
		take: limit,
		skip,
		// sorting
		orderBy: {
			[sortBy]: sortOrder,
		},
	});

	const totalAppointmentCount = await prisma.appointment.count({
		where: {
			AND: andConditions,
		},
	});

	return {
		data: appointments,
		meta: {
			limit,
			page,
			total: totalAppointmentCount,
			totalPages: Math.ceil(totalAppointmentCount / limit),
		},
	};
};

//for all loggedin user
const getSingleAppointment = async (
	appointmentId: string,
	user: RequestUser,
) => {
	const appointment = await prisma.appointment.findUnique({
		where: {
			id: appointmentId,
		},
		include: {
			doctor: {
				select: {
					id: true,
					name: true,
					email: true,
					specialization: true,
					userId: true,
				},
			},
			patient: {
				select: { id: true, name: true, email: true, userId: true },
			},
			schedule: true,
			payment: true,
		},
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment not found");
	}

	if (user.role === "PATIENT") {
		if (appointment.patient.userId !== user.userId) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You are not allowed to view this Appointment",
			);
		}
	}

	if (user.role === "DOCTOR") {
		if (appointment.doctor.userId !== user.userId) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You are not allowed to view this Appointment",
			);
		}
	}

	return appointment;
};

export const AppointmentService = {
	bookAppointment,
	payAppointment,
	bookAppointmentCallback,
	cancelAppointment,
	updateAppointmentStatus,
	getMyAppointments,
	getDoctorAppointments,
	getAllAppointments,
	getSingleAppointment,
};
