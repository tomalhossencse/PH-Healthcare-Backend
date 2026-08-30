import cron from "node-cron";
import { prisma } from "./prisma";

export const deleteUnverifiedDoctors = async () => {
	cron.schedule("* * * * *", async () => {
		try {
			const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
			const deletedDoctors = await prisma.user.deleteMany({
				where: {
					role: "DOCTOR",
					emailVerified: false,
					createdAt: { lt: oneHourAgo },
					doctor: {
						verificationStatus: "PENDING",
					},
				},
			});
			if (deletedDoctors.count > 0) {
				console.log(`Cron : Deleted ${deletedDoctors.count} unverfied doctors`);
			}
		} catch (error) {
			console.log(
				"Cron : Failed to delete unverified doctor applications",
				error,
			);
		}

		console.log("Cron : unverfied doctor delete task every hours");
	});
};

export const deleteRejectedDoctors = async () => {
	cron.schedule("0 0 1 * *", async () => {
		try {
			const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
			const deletedDoctors = await prisma.user.deleteMany({
				where: {
					role: "DOCTOR",
					createdAt: { lt: oneMonthAgo },
					doctor: {
						verificationStatus: "REJECTED",
					},
				},
			});
			if (deletedDoctors.count > 0) {
				console.log(`Cron : Deleted ${deletedDoctors.count} Rejected doctors`);
			}
		} catch (error) {
			console.log(
				"Cron : Failed to delete Rejected doctor applications",
				error,
			);
		}

		console.log("Cron : Rejected doctor delete task every Months");
	});
};
