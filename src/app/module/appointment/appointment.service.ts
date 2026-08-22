import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";

const bookAppointment = async (payload: any, user: RequestUser) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		// appointment bussiness logic

		const appointment = await tx.appointment.create({
			data: {
				status: "PENDING",
			},
		});

		// bkash bussiness logic
		const bkashIdToken = await getBkashIdToken();

		if (!bkashIdToken) {
			throw new Error("Bkash access token not found");
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
					amount: "999",
					currency: "BDT",
					intent: "sale",
					// merchantInvoiceNumber: "Inv02",
					merchantInvoiceNumber: appointment.id,
				}),
			},
		);

		const bkashCreatePaymentResult = await bkashCreatePaymentRes.json();

		// payment model create
		await tx.payment.create({
			data: {
				merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
				appointmentId: appointment.id,
				amount: "1200",
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

const payAppointment = async (payload: any, user: RequestUser) => {
	const appointmentId = payload.appointmentId;

	const existingAppointment = await prisma.appointment.findUnique({
		where: {
			id: appointmentId,
		},
	});

	if (!existingAppointment) {
		throw new Error("Appointment is not exists");
	}

	if (existingAppointment.status !== "PENDING") {
		throw new Error("Appointment is not pending");
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
	const bkashIdToken = await getBkashIdToken();

	if (!bkashIdToken) {
		throw new Error("Bkash access token not found");
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
				amount: "999",
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
	const transactionResult = await prisma.$transaction(async (tx) => {
		const paymentId = query.paymentID;
		if (!paymentId) {
			throw new Error("PaymentId is missing");
		}
		const status = query.status;
		if (!status) {
			throw new Error("Payment Status is missing");
		}

		const bkashIdToken = await getBkashIdToken();

		if (!bkashIdToken) {
			throw new Error("Bkash access token not found");
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
			await tx.appointment.update({
				where: {
					id: bkashExecutedPaymentResult.merchantInvoiceNumber,
				},
				data: {
					status: "CONFIRMED",
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
	});

	return transactionResult;
};

export const AppointmentService = {
	bookAppointment,
	payAppointment,
	bookAppointmentCallback,
};
