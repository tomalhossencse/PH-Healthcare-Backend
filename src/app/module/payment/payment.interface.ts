import { PaymentWhereInput } from "../../../generated/prisma/models";

export interface IPaymentQuery extends PaymentWhereInput {
	searchTerm?: string;
	page?: string;
	limit?: string;
	sortBy?: string;
	sortOrder?: string;
	patientEmail?: string;
}
