import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";

const bookAppointment = async () => {
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
				callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
				merchantAssociationInfo: "MI05MID54RF09123456One",
				amount: "999",
				currency: "BDT",
				intent: "sale",
				merchantInvoiceNumber: "Inv02",
			}),
		},
	);

	const bkashCreatePaymentResult = await bkashCreatePaymentRes.json();

	return bkashCreatePaymentResult;
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
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
		return {
			bkashExecutedPaymentResult,
			redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
		};
	}

	if (status === "failure") {
		return {
			bkashExecutedPaymentResult,
			redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
		};
	}

	if (status === "cancel") {
		return {
			bkashExecutedPaymentResult,
			redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
		};
	}

	return {
		bkashExecutedPaymentResult,
		redirectUrl: `${config.frontend_url}/dashboard/my-appointments`,
	};
};

export const AppointmentService = {
	bookAppointment,
	bookAppointmentCallback,
};
