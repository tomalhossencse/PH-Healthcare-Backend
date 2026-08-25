// User fields required for initial doctor registration
export interface IApplyAsDoctorUserPayload {
	name: string;
	email: string;
}

// Doctor profile creation fields based on Doctor model
export interface IApplyAsDoctorDetailsPayload {
	specialization: string;
	licenseNumber: string;
	qualifications: string;
	experienceYears: number;
	bio?: string;
	consultationFee?: number;
	contactNumber?: string;
	address?: string;
}

// Full JSON payload structure sent inside req.body.data
export interface IApplyAsDoctorPayload {
	user: IApplyAsDoctorUserPayload;
	doctor: IApplyAsDoctorDetailsPayload;
}

export interface IVerifyDoctorPayload {
	otp: string;
	email: string;
}
