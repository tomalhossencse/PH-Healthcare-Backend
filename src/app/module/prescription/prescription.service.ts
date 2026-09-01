import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { ICreatePrescriptionPayload } from "./prescription.interface";
import httpStatus from "http-status";
import PDFDocument from "pdfkit";
import ejs from "ejs";
import config from "../../config";
import { transporter } from "../../lib/nodemailer";
import path from "path";
import { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../../lib/cloudinary";
const createPrescription = async (
	payload: ICreatePrescriptionPayload,
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

	const appointment = await prisma.appointment.findUnique({
		where: {
			id: payload.appointmentId,
			doctorId: doctor.id,
		},
		include: { patient: true },
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment not found");
	}

	if (appointment.status !== "COMPLETED") {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Prescription can only be written for a completed appointment",
		);
	}

	if (appointment.prescriptionUrl) {
		throw new AppError(
			httpStatus.CONFLICT,
			"A Prescription Already exists for this appointment",
		);
	}

	// make pdf
	// 1. Initialize Document
	const pdfDocument = new PDFDocument({
		margin: 50,
		size: "A4",
	});

	const pdfChuncks: Buffer[] = [];

	pdfDocument.on("data", (chunk: Buffer) => {
		pdfChuncks.push(chunk);
	});

	const pdfReadyPromise = new Promise<Buffer>((resolve) => {
		pdfDocument.on("end", () => {
			resolve(Buffer.concat(pdfChuncks));
		});
	});

	// Helper: Horizontal Divider
	const drawDivider = (y?: number) => {
		const currentY = y || pdfDocument.y;
		pdfDocument
			.strokeColor("#E2E8F0")
			.lineWidth(1)
			.moveTo(50, currentY)
			.lineTo(545, currentY)
			.stroke();
	};

	// ==========================================
	// HEADER SECTION
	// ==========================================
	pdfDocument
		.fillColor("#0284C7")
		.fontSize(22)
		.font("Helvetica-Bold")
		.text("PH Healthcare System", 50, 40, { align: "left" });

	pdfDocument
		.fillColor("#64748B")
		.fontSize(10)
		.font("Helvetica")
		.text("Medical Prescription & Care Plan", 50, 67, { align: "left" });

	pdfDocument
		.fillColor("#0F172A")
		.fontSize(10)
		.font("Helvetica-Bold")
		.text(
			`Date: ${new Date().toLocaleDateString("en-US", { dateStyle: "medium" })}`,
			400,
			45,
			{ align: "right" },
		);

	pdfDocument.moveDown(2);
	drawDivider(88);

	// ==========================================
	// PATIENT & DOCTOR INFORMATION GRID
	// ==========================================
	const infoStartY = 105;

	// Doctor Details (Left Column)
	pdfDocument
		.fillColor("#0369A1")
		.fontSize(11)
		.font("Helvetica-Bold")
		.text("DOCTOR DETAILS", 50, infoStartY);

	pdfDocument
		.fillColor("#0F172A")
		.fontSize(10)
		.font("Helvetica-Bold")
		.text(`Dr. ${doctor.name || "N/A"}`, 50, infoStartY + 18);

	pdfDocument
		.fillColor("#475569")
		.fontSize(9)
		.font("Helvetica")
		.text(`Email: ${doctor.email || "N/A"}`, 50, infoStartY + 32);

	// Patient Details (Right Column)
	pdfDocument
		.fillColor("#0369A1")
		.fontSize(11)
		.font("Helvetica-Bold")
		.text("PATIENT DETAILS", 320, infoStartY);

	pdfDocument
		.fillColor("#0F172A")
		.fontSize(10)
		.font("Helvetica-Bold")
		.text(appointment.patient?.name || "N/A", 320, infoStartY + 18);

	pdfDocument
		.fillColor("#475569")
		.fontSize(9)
		.font("Helvetica")
		.text(
			`Email: ${appointment.patient?.email || "N/A"}`,
			320,
			infoStartY + 32,
		);

	pdfDocument.y = infoStartY + 60;
	drawDivider();

	// ==========================================
	// FINDINGS / DIAGNOSIS SECTION
	// ==========================================
	pdfDocument.moveDown(1.2);
	pdfDocument
		.fillColor("#0F172A")
		.fontSize(12)
		.font("Helvetica-Bold")
		.text("Clinical Findings & Diagnosis");

	pdfDocument.moveDown(0.4);

	// Background card for findings
	const findingsY = pdfDocument.y;
	const findingsText = payload.findings || "No specific findings recorded.";
	const findingsHeight =
		pdfDocument.heightOfString(findingsText, { width: 475 }) + 16;

	pdfDocument
		.roundedRect(50, findingsY, 495, findingsHeight, 6)
		.fill("#F8FAFC");

	pdfDocument
		.fillColor("#334155")
		.fontSize(9.5)
		.font("Helvetica")
		.text(findingsText, 60, findingsY + 8, {
			width: 475,
			lineGap: 4,
		});

	pdfDocument.y = findingsY + findingsHeight + 15;

	// ==========================================
	// MEDICINES / PRESCRIPTION SECTION
	// ==========================================
	pdfDocument
		.fillColor("#0F172A")
		.fontSize(12)
		.font("Helvetica-Bold")
		.text("Prescribed Medicines (Rx)");

	pdfDocument.moveDown(0.6);

	// Table Header Bar
	const tableHeaderY = pdfDocument.y;
	pdfDocument.rect(50, tableHeaderY, 495, 24).fill("#0284C7");

	pdfDocument
		.fillColor("#FFFFFF")
		.fontSize(9)
		.font("Helvetica-Bold")
		.text("#", 60, tableHeaderY + 7, { width: 20 })
		.text("MEDICINE NAME", 85, tableHeaderY + 7, { width: 180 })
		.text("DOSAGE", 270, tableHeaderY + 7, { width: 110 })
		.text("DURATION", 385, tableHeaderY + 7, { width: 150 });

	let currentY = tableHeaderY + 28;

	payload.medicines.forEach((medicine, i) => {
		const isEven = i % 2 === 0;
		const rowHeight = medicine.instructions ? 36 : 24;

		// Row Background
		if (isEven) {
			pdfDocument.rect(50, currentY - 4, 495, rowHeight).fill("#F1F5F9");
		}

		// Main Row Values
		pdfDocument
			.fillColor("#0F172A")
			.fontSize(9.5)
			.font("Helvetica-Bold")
			.text(`${i + 1}.`, 60, currentY, { width: 20 })
			.text(medicine.name, 85, currentY, { width: 180 });

		pdfDocument
			.font("Helvetica")
			.fillColor("#334155")
			.text(medicine.dosage, 270, currentY, { width: 110 })
			.text(medicine.duration, 385, currentY, { width: 150 });

		// Optional Instructions Sub-row
		if (medicine.instructions) {
			currentY += 14;
			pdfDocument
				.fillColor("#64748B")
				.fontSize(8.5)
				.font("Helvetica-Oblique")
				.text(`Instruction: ${medicine.instructions}`, 85, currentY, {
					width: 440,
				});
		}

		currentY += 16;
	});

	// ==========================================
	// FOOTER / SIGNATURE SECTION
	// ==========================================
	const footerY = 730;

	drawDivider(footerY - 30);

	// Doctor Signature Placeholder
	pdfDocument
		.strokeColor("#CBD5E1")
		.lineWidth(1)
		.moveTo(380, footerY + 25)
		.lineTo(525, footerY + 25)
		.stroke();

	pdfDocument
		.fillColor("#0F172A")
		.fontSize(9)
		.font("Helvetica-Bold")
		.text(`Dr. ${doctor.name || ""}`, 380, footerY + 30, {
			align: "center",
			width: 145,
		})
		.font("Helvetica")
		.fillColor("#64748B")
		.fontSize(8)
		.text("Authorized Signature", 380, footerY + 42, {
			align: "center",
			width: 145,
		});

	// Bottom System Note
	pdfDocument
		.fillColor("#94A3B8")
		.fontSize(8)
		.font("Helvetica")
		.text(
			"This prescription is digitally generated by PH Healthcare System.",
			50,
			footerY + 42,
			{ align: "left" },
		);

	pdfDocument.end();

	const pdfBuffer = await pdfReadyPromise;

	// upload to cloudinary
	const pdfUploadResult = await new Promise<UploadApiResponse>(
		(reslove, reject) => {
			cloudinary.uploader
				.upload_stream(
					{ resource_type: "raw", format: "pdf" },
					async (error, result) => {
						if (error) {
							console.log(error);
							throw new AppError(
								httpStatus.INTERNAL_SERVER_ERROR,
								error.message,
							);
						}

						if (!result) {
							return reject(
								new AppError(
									httpStatus.INTERNAL_SERVER_ERROR,
									"No result return from cloudinary",
								),
							);
						}

						reslove(result);
					},
				)
				.end(pdfBuffer);
		},
	);

	const updatedAppointment = await prisma.appointment.update({
		where: {
			id: appointment.id,
		},
		data: {
			prescriptionUrl: pdfUploadResult.secure_url,
			prescriptionPublicId: pdfUploadResult.public_id,
		},
	});

	// send email

	const templatePath = path.join(
		process.cwd(),
		`src/app/templates/prescription.ejs`,
	);

	const templateData = {
		appointment: {
			patient: {
				name: appointment.patient.name,
				email: appointment.patient.email,
			},
		},
		doctor: {
			name: doctor.name,
			qualification: doctor.specialization,
		},
		payload: {
			findings: payload.findings,
			medicines: payload.medicines,
		},
	};

	const html = await ejs.renderFile(templatePath, templateData);

	await transporter.sendMail({
		from: config.email_sender,
		to: appointment.patient.email,
		subject: "Your Medical Prescription - PH Healthcare System",
		html,
		attachments: [{ filename: "prescription.pdf", content: pdfBuffer }],
	});

	return updatedAppointment;
};

const getSinglePrescription = async (
	appointmentId: string,
	user: RequestUser,
) => {
	const appointment = await prisma.appointment.findUnique({
		where: { id: appointmentId },
		include: {
			patient: { select: { id: true, name: true, userId: true } },
			doctor: { select: { id: true, name: true, userId: true } },
		},
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
	}

	if (user.role === "PATIENT") {
		if (appointment.patient.userId !== user.userId) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You Are Not Allowed To View This Appointment",
			);
		}
	}
	if (user.role === "DOCTOR") {
		if (appointment.doctor.userId !== user.userId) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You Are Not Allowed To View This Appointment",
			);
		}
	}

	if (!appointment.prescriptionUrl) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"No Prescription Has Been Written Yet",
		);
	}

	return {
		appointment,
		prescription: appointment.prescriptionUrl,
	};
};

export const PrescriptionServices = {
	createPrescription,
	getSinglePrescription,
};
