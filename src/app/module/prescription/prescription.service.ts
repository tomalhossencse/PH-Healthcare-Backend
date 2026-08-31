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

	const pdfDocument = new PDFDocument({ margin: 50 });

	const pdfChuncks: Buffer[] = [];

	pdfDocument.on("data", (chunk: Buffer) => {
		pdfChuncks.push(chunk);
	});

	const pdfReadyPromise = new Promise<Buffer>((reslove) => {
		pdfDocument.on("end", () => {
			reslove(Buffer.concat(pdfChuncks));
		});
	});
	// write pdf
	pdfDocument.fontSize(20).text("PH Healthcare System", { align: "center" });

	pdfDocument.fontSize(14).text("Prescription", { align: "center" });
	pdfDocument.moveDown(2);

	pdfDocument.fontSize(12).text(`Patient Name : ${appointment.patient.name}`);
	pdfDocument.fontSize(12).text(`Patient Email : ${appointment.patient.email}`);
	pdfDocument.moveDown(2);

	pdfDocument.text(`Doctor Name : ${doctor.name}`);
	pdfDocument.text(`Doctor Specialization : ${doctor.email}`);
	pdfDocument.moveDown(2);

	pdfDocument.fontSize(14).text("Findings");
	pdfDocument.fontSize(12).text(payload.findings);
	pdfDocument.moveDown(2);

	pdfDocument.fontSize(14).text("Medicines");
	pdfDocument.moveDown(0.5);

	payload.medicines.forEach((medicine, i) => {
		PDFDocument.fontSize(12).text(`${i + 1}.${medicine.name}`);
		PDFDocument.text(`  Dosage : ${medicine.dosage}`);
		PDFDocument.text(`  Duration : ${medicine.duration}`);
		if (medicine.instructions) {
			PDFDocument.text(`  Instructions : ${medicine.instructions}`);
		}
		pdfDocument.moveDown(0.5);
	});

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
		`src/app/templates/patient-payment-invoice.ejs`,
	);

	const templateData = {
		name: appointment.patient.name,
	};

	const html = await ejs.renderFile(templatePath, templateData);

	await transporter.sendMail({
		from: config.email_sender,
		to: appointment.patient.email,
		subject: "Your Appointment Invoice - PH Healthcare System",
		html,
		attachments: [{ filename: "invoice.pdf", content: pdfBuffer }],
	});
};

const getSinglePrescription = async () => {};

export const PrescriptionServices = {
	createPrescription,
	getSinglePrescription,
};
