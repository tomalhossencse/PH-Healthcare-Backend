import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import config from "../config";

export const seedSuperAdmin = async () => {
	try {
		const ifSuperAdminExist = await prisma.user.findFirst({
			where: {
				role: "SUPER_ADMIN",
			},
		});

		if (ifSuperAdminExist) {
			console.log("Super Admin Already Exists");
			return;
		}

		const name = config.super_admin_name;
		const email = config.super_admin_email;
		const password = config.super_admin_password;

		if (!name || !email || !password) {
			throw new Error("Super Admin Name, Email , Password Missing in Env file");
		}
		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);

		const superAdmin = await prisma.user.create({
			data: {
				name,
				email,
				role: "SUPER_ADMIN",
				password: hashedPassword,
				emailVerified: true,
				needPasswordChange: false,
			},
		});

		console.log("Super Admin created", superAdmin);
	} catch (error) {
		await prisma.user.delete({
			where: { email: config.super_admin_email },
		});
		console.log("Error Seeding Super Admin", error);
	}
};

export const seedTesterAdmin = async () => {
	try {
		const ifTesterAdminExist = await prisma.user.findUnique({
			where: {
				email: config.tester_admin_email,
			},
		});

		if (ifTesterAdminExist) {
			console.log("Tester Admin Already Exists");
			return;
		}

		const name = config.tester_admin_name;
		const email = config.tester_admin_email;
		const password = config.tester_admin_password;

		if (!name || !email || !password) {
			throw new Error(
				"Tester Admin Name, Email , Password Missing in Env file",
			);
		}
		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);

		const testerAdmin = await prisma.user.create({
			data: {
				name,
				email,
				role: "ADMIN",
				password: hashedPassword,
				emailVerified: true,
				needPasswordChange: false,
			},
		});

		console.log("Tester Admin created", testerAdmin);
	} catch (error) {
		await prisma.user.delete({
			where: { email: config.tester_admin_email },
		});
		console.log("Error Seeding Testing Admin", error);
	}
};

export const seedTesterDoctor = async () => {
	try {
		const ifTesterDoctorExist = await prisma.user.findUnique({
			where: {
				email: config.tester_doctor_email,
			},
		});

		if (ifTesterDoctorExist) {
			console.log("Tester Doctor Already Exists");
			return;
		}

		const name = config.tester_doctor_name;
		const email = config.tester_doctor_email;
		const password = config.tester_doctor_password;

		if (!name || !email || !password) {
			throw new Error(
				"Tester Doctor Name, Email , Password Missing in Env file",
			);
		}
		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);

		const testerDoctor = await prisma.user.create({
			data: {
				name,
				email,
				role: "DOCTOR",
				password: hashedPassword,
				emailVerified: true,
				needPasswordChange: false,
				doctor: {
					create: {
						email,
						experienceYears: 5,
						name,
						qualifications: "MBBS",
						specialization: "Neurology",
						licenseNumber: "BMDC00",
					},
				},
			},
		});

		console.log("Tester Admin created", testerDoctor);
	} catch (error) {
		await prisma.user.delete({
			where: { email: config.tester_doctor_email },
		});
		console.log("Error Seeding Testing Doctor", error);
	}
};
