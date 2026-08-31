import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { IQuery } from "../../../interface";
import { PaymentWhereInput } from "../../../generated/prisma/models";
import { IPaymentQuery } from "./payment.interface";

const getMyPayments = async (query: IQuery, user: RequestUser) => {
	const limit = query.limit ? Number(query.limit) : 5;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const patient = await prisma.patient.findUnique({
		where: {
			userId: user.userId,
		},
	});

	if (!patient) {
		throw new AppError(httpStatus.NOT_FOUND, "Patient Profile not found");
	}

	const andConditions: PaymentWhereInput[] = [
		{ appointment: { patientId: patient.id } },
	];

	const payments = await prisma.payment.findMany({
		where: { AND: andConditions },
		take: limit,
		skip,
		orderBy: {
			[sortBy]: sortOrder,
		},
		include: {
			appointment: {
				include: {
					doctor: {
						select: { id: true, name: true, specialization: true },
					},
					schedule: true,
				},
			},
		},
	});

	const totalPaymentCount = await prisma.payment.count({
		where: {
			AND: andConditions,
		},
	});

	return {
		data: payments,
		meta: {
			limit,
			page,
			total: totalPaymentCount,
			totalPages: Math.ceil(totalPaymentCount / limit),
		},
	};
};

const getAllPayments = async (query: IPaymentQuery) => {
	const limit = query.limit ? Number(query.limit) : 5;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";
	const andConditions: PaymentWhereInput[] = [];

	if (query.patientEmail) {
		andConditions.push({
			appointment: {
				patient: {
					email: query.patientEmail,
				},
			},
		});
	}

	const payments = await prisma.payment.findMany({
		where: {
			AND: andConditions,
		},
		take: limit,
		skip,
		orderBy: {
			[sortBy]: sortOrder,
		},
		include: {
			appointment: {
				include: {
					doctor: {
						select: { id: true, name: true, specialization: true },
					},
					schedule: true,
				},
			},
		},
	});

	const totalPaymentCount = await prisma.payment.count({
		where: {
			AND: andConditions,
		},
	});

	return {
		data: payments,
		meta: {
			limit,
			page,
			total: totalPaymentCount,
			totalPages: Math.ceil(totalPaymentCount / limit),
		},
	};
};

const getSinglePayment = async (paymentId: string, user: RequestUser) => {
	const payment = await prisma.payment.findUnique({
		where: { id: paymentId },
		include: {
			appointment: {
				include: {
					patient: {
						select: { id: true, name: true, email: true, userId: true },
					},
					doctor: {
						select: { id: true, name: true, specialization: true },
					},
					schedule: true,
				},
			},
		},
	});

	if (!payment) {
		throw new AppError(httpStatus.NOT_FOUND, "Payment not found");
	}

	if (user.role === "PATIENT") {
		if (payment.appointment.patient.userId !== user.userId) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You are not allowed to view this Payment",
			);
		}
	}

	return payment;
};

export const PaymentService = {
	getAllPayments,
	getMyPayments,
	getSinglePayment,
};
