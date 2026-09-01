import {
	addDays,
	differenceInMinutes,
	isAfter,
	isSameDay,
	startOfDay,
} from "date-fns";

import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import {
	ICreateSchedulePayload,
	IScheduleQuery,
	IUpdateSchedulePayload,
} from "./schedule.interface";
import httpStatus from "http-status";
import { ScheduleWhereInput } from "../../../generated/prisma/models";
import { ScheduleStatus } from "../../../generated/prisma/enums";

const createSchedule = async (
	payload: ICreateSchedulePayload,
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

	if (doctor.verificationStatus !== "APPROVED") {
		throw new AppError(httpStatus.FORBIDDEN, "Doctor is not Verified");
	}

	if (!isSameDay(payload.startDateTime, payload.endDateTime)) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Schedule start time & end time must be same day",
		);
	}

	if (isAfter(payload.startDateTime, payload.endDateTime)) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Schedule start time cannot be after end time",
		);
	}

	const startOfTheDay = startOfDay(payload.startDateTime); // 29 august => 12.00 am
	const startOfNextDay = addDays(startOfTheDay, 1); // 30 august => 12.00 am

	const existingScheduleOnThisDate = await prisma.schedule.findFirst({
		where: {
			doctorId: doctor.id,
			isDeleted: false,
			startDateTime: {
				gte: startOfTheDay,
				lt: startOfNextDay,
			},
		},
	});

	if (existingScheduleOnThisDate) {
		throw new AppError(
			httpStatus.CONFLICT,
			"You already have a schedule for this date",
		);
	}

	const duriationInMinutes = differenceInMinutes(
		payload.endDateTime,
		payload.startDateTime,
	);
	const MINS_PER_SLOT = 20;

	const totalSlots = Math.floor(duriationInMinutes / MINS_PER_SLOT);

	if (totalSlots < 1) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Schedule duration must be at least ${MINS_PER_SLOT} minutes`,
		);
	}

	const schedule = await prisma.schedule.create({
		data: {
			startDateTime: payload.startDateTime,
			endDateTime: payload.endDateTime,
			meetingLink: payload.meetingLink,
			totalSlots,
			availableSlots: totalSlots,
			doctorId: doctor.id,
		},
		include: {
			doctor: {
				select: {
					name: true,
					email: true,
					contactNumber: true,
				},
			},
		},
	});

	return schedule;
};

const getMySchedule = async (query: IScheduleQuery, user: RequestUser) => {
	const doctor = await prisma.doctor.findUnique({
		where: {
			userId: user.userId,
		},
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor profile not found");
	}

	const limit = query.limit ? Number(query.limit) : 5;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const andConditions: ScheduleWhereInput[] = [
		{
			doctorId: doctor.id,
		},
		{
			isDeleted: false,
		},
	];

	// filtering
	if (query.status) {
		andConditions.push({ status: query.status });
	}

	const schedules = await prisma.schedule.findMany({
		where: {
			AND: andConditions,
		},
		// pagination
		take: limit,
		skip: skip,
		//sorting
		orderBy: {
			[sortBy]: sortOrder,
		},
		include: {
			appointments: {
				include: {
					patient: true,
				},
			},
		},
	});

	const totalScheduleCount = await prisma.schedule.count({
		where: {
			AND: andConditions,
		},
	});

	return {
		data: schedules,
		meta: {
			limit,
			page,
			total: totalScheduleCount,
			totalPages: Math.ceil(totalScheduleCount / limit),
		},
	};
};

const getAllSchedule = async (query: IScheduleQuery) => {
	const limit = query.limit ? Number(query.limit) : 5;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const andConditions: ScheduleWhereInput[] = [];

	// searching
	if (query.searchTerm) {
		andConditions.push({
			doctor: {
				// searching
				OR: [
					{
						name: {
							contains: query.searchTerm,
							mode: "insensitive",
						},
					},
					{
						email: {
							contains: query.searchTerm,
							mode: "insensitive",
						},
					},
					{
						specialization: {
							contains: query.searchTerm,
							mode: "insensitive",
						},
					},
					{
						licenseNumber: {
							contains: query.searchTerm,
							mode: "insensitive",
						},
					},
				],
			},
		});
	}

	// filtering
	if (query.status) {
		andConditions.push({ status: query.status });
	}

	if (query.email) {
		andConditions.push({
			doctor: {
				email: query.email,
			},
		});
	}

	const schedules = await prisma.schedule.findMany({
		where: {
			AND: andConditions,
		},
		// pagination
		take: limit,
		skip: skip,
		//sorting
		orderBy: {
			[sortBy]: sortOrder,
		},
		include: {
			appointments: {
				include: {
					patient: true,
				},
			},
		},
	});

	const totalScheduleCount = await prisma.schedule.count({
		where: {
			AND: andConditions,
		},
	});

	return {
		data: schedules,
		meta: {
			limit,
			page,
			total: totalScheduleCount,
			totalPages: Math.ceil(totalScheduleCount / limit),
		},
	};
};

const getScheduleById = async (scheduleId: string) => {
	const schedule = await prisma.schedule.findUnique({
		where: {
			id: scheduleId,
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
			appointments: {
				include: {
					patient: true,
				},
			},
		},
	});

	if (!schedule || schedule.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
	}

	return schedule;
};

const updateSchedule = async (
	scheduleId: string,
	payload: IUpdateSchedulePayload,
	user: RequestUser,
) => {
	const doctor = await prisma.doctor.findUnique({
		where: {
			userId: user.userId,
		},
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor profile not found");
	}

	const schedule = await prisma.schedule.findUnique({
		where: {
			id: scheduleId,
		},
	});

	if (!schedule || schedule.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Schedule not found");
	}

	if (schedule.doctorId !== doctor.id) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not allowed to update this schedule",
		);
	}

	if (
		schedule.status === ScheduleStatus.PUBLISHED &&
		schedule.totalSlots !== schedule.availableSlots
	) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Schedule Once published and appointment booked cannot be updated",
		);
	}

	payload.meetingLink = payload.meetingLink || schedule.meetingLink;
	payload.startDateTime = payload.startDateTime || schedule.startDateTime;
	payload.endDateTime = payload.endDateTime || schedule.endDateTime;

	if (!isSameDay(payload.startDateTime, payload.endDateTime)) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Schedule start time & end time must be same day",
		);
	}

	if (isAfter(payload.startDateTime, payload.endDateTime)) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Schedule start time cannot be after end time",
		);
	}

	const startOfTheDay = startOfDay(payload.startDateTime); // 29 august => 12.00 am
	const startOfNextDay = addDays(startOfTheDay, 1); // 30 august => 12.00 am

	const existingScheduleOnThisDate = await prisma.appointment.findFirst({
		where: {
			doctorId: doctor.id,
			isDeleted: false,
			startDateTime: {
				gte: startOfTheDay,
				lt: startOfNextDay,
			},
		},
	});

	if (existingScheduleOnThisDate) {
		throw new AppError(
			httpStatus.CONFLICT,
			"You already have a schedule for this date",
		);
	}

	const duriationInMinutes = differenceInMinutes(
		payload.startDateTime,
		payload.endDateTime,
	);
	const MINS_PER_SLOT = 20;

	const totalSlots = Math.floor(duriationInMinutes / MINS_PER_SLOT);

	const updatedSchedule = await prisma.schedule.update({
		where: {
			id: scheduleId,
		},
		data: {
			startDateTime: payload.startDateTime,
			endDateTime: payload.endDateTime,
			meetingLink: payload.meetingLink,
			totalSlots,
			availableSlots: totalSlots,
		},
		include: {
			doctor: {
				select: {
					name: true,
					email: true,
					contactNumber: true,
				},
			},
		},
	});

	return updatedSchedule;
};

const publishSchedule = async (scheduleId: string, user: RequestUser) => {
	const doctor = await prisma.doctor.findUnique({
		where: {
			userId: user.userId,
		},
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor profile not found");
	}

	const schedule = await prisma.schedule.findUnique({
		where: {
			id: scheduleId,
		},
	});

	if (!schedule || schedule.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Schedule not found");
	}

	if (schedule.doctorId !== doctor.id) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not allowed to update this schedule",
		);
	}

	if (schedule.status === ScheduleStatus.PUBLISHED) {
		throw new AppError(httpStatus.CONFLICT, "Schedule is already published");
	}

	const publishedSchedule = await prisma.schedule.update({
		where: {
			id: scheduleId,
		},
		data: {
			status: "PUBLISHED",
		},
	});

	return publishedSchedule;
};

const deleteSchedule = async (scheduleId: string, user: RequestUser) => {
	const doctor = await prisma.doctor.findUnique({
		where: {
			userId: user.userId,
		},
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor profile not found");
	}

	const schedule = await prisma.schedule.findUnique({
		where: {
			id: scheduleId,
		},
	});

	if (!schedule || schedule.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Schedule not found");
	}

	if (schedule.doctorId !== doctor.id) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not allowed to delete this schedule",
		);
	}

	if (
		schedule.status === ScheduleStatus.PUBLISHED &&
		schedule.totalSlots !== schedule.availableSlots
	) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Schedule Once published and appointment booked cannot be deleted",
		);
	}

	const deletedSchedule = await prisma.schedule.update({
		where: {
			id: scheduleId,
		},
		data: {
			isDeleted: true,
			deletedAt: new Date(),
		},
	});

	return deletedSchedule;
};

const getTodaySchedule = async (query: IScheduleQuery) => {
	if (!query.doctorId) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Doctor id must be provided in query",
		);
	}
	const doctor = await prisma.doctor.findUnique({
		where: {
			id: query.doctorId,
		},
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor profile not found");
	}

	const limit = query.limit ? Number(query.limit) : 5;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	// 1. Get current moment in UTC
	const now = new Date();

	const startOfToday = startOfDay(now);

	const startOfNextDay = addDays(startOfToday, 1);

	const andConditions: ScheduleWhereInput[] = [
		{
			doctorId: doctor.id,
		},
		{
			isDeleted: false,
		},
		{
			status: "PUBLISHED",
		},
		{
			startDateTime: { gte: startOfToday, lt: startOfNextDay, gt: now },
		},
		{
			availableSlots: { gt: 0 },
		},
	];

	const schedules = await prisma.schedule.findMany({
		where: {
			AND: andConditions,
		},
		// pagination
		take: limit,
		skip: skip,
		//sorting
		orderBy: {
			[sortBy]: sortOrder,
		},
	});

	const totalScheduleCount = await prisma.schedule.count({
		where: {
			AND: andConditions,
		},
	});

	return {
		data: schedules,
		meta: {
			limit,
			page,
			total: totalScheduleCount,
			totalPages: Math.ceil(totalScheduleCount / limit),
		},
	};
};

export const ScheduleService = {
	createSchedule,
	getMySchedule,
	getAllSchedule,
	getScheduleById,
	updateSchedule,
	publishSchedule,
	deleteSchedule,
	getTodaySchedule,
};
