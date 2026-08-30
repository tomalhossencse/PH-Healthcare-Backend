import { ScheduleWhereInput } from "../../../generated/prisma/models";

export interface ICreateSchedulePayload {
	startDateTime: Date;
	endDateTime: Date;
	meetingLink: string;
}

export interface IUpdateSchedulePayload {
	startDateTime?: Date;
	endDateTime?: Date;
	meetingLink?: string;
}

export interface IScheduleQuery extends ScheduleWhereInput {
	searchTerm?: string;
	page?: string;
	limit?: string;
	sortBy?: string;
	sortOrder?: string;
	email?: string;
	doctorId?: string;
}
