import jsPDF from "jspdf";
import type { AttendanceSession, AttendanceSubmission } from "@/lib/attendance";

const LOGO_PATH = "/UATO/aga-horizontal-logo.png";
const ROWS_PER_PAGE = 12;

function safeFileName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ");
}

function formatDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function cell(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { bold?: boolean; center?: boolean; fill?: [number, number, number]; fontSize?: number } = {}
) {
  if (options.fill) {
    doc.setFillColor(...options.fill);
    doc.rect(x, y, width, height, "F");
  }
  doc.setDrawColor(39, 61, 89);
  doc.setLineWidth(0.22);
  doc.rect(x, y, width, height);
  doc.setTextColor(18, 35, 57);
  doc.setFont("helvetica", options.bold ? "bold" : "normal");
  doc.setFontSize(options.fontSize || 8);
  const lines = doc.splitTextToSize(text || "", width - 3).slice(0, 3);
  const lineHeight = (options.fontSize || 8) * 0.36;
  const textY = y + Math.max(3.2, (height - lines.length * lineHeight) / 2 + 2.7);
  doc.text(lines, options.center ? x + width / 2 : x + 1.5, textY, {
    align: options.center ? "center" : "left"
  });
}

type LearnerRow = {
  identityHash: string;
  name: string;
  lastFour: string;
  amSignature: string;
  pmSignature: string;
};

function mergeSubmissions(submissions: AttendanceSubmission[]) {
  const rows = new Map<string, LearnerRow>();
  submissions.forEach((submission) => {
    const key = submission.identityHash || `${submission.learnerName.toLowerCase()}|${submission.lastFour}`;
    const row = rows.get(key) || {
      identityHash: key,
      name: submission.learnerName,
      lastFour: submission.lastFour,
      amSignature: "",
      pmSignature: ""
    };
    row.name = submission.learnerName;
    row.lastFour = submission.lastFour;
    if (submission.period === "am") row.amSignature = submission.signatureDataUrl;
    else row.pmSignature = submission.signatureDataUrl;
    rows.set(key, row);
  });
  return Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function drawSignature(doc: jsPDF, value: string, x: number, y: number, width: number, height: number) {
  if (!value) return;
  const image = await loadImage(value);
  if (!image) return;
  const ratio = image.naturalWidth / Math.max(1, image.naturalHeight);
  let imageWidth = width - 4;
  let imageHeight = imageWidth / ratio;
  if (imageHeight > height - 3) {
    imageHeight = height - 3;
    imageWidth = imageHeight * ratio;
  }
  doc.addImage(image, "PNG", x + (width - imageWidth) / 2, y + (height - imageHeight) / 2, imageWidth, imageHeight);
}

async function drawPage(
  doc: jsPDF,
  session: AttendanceSession,
  rows: LearnerRow[],
  pageNumber: number,
  pageCount: number,
  logo: HTMLImageElement | null
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = 16;
  const contentWidth = pageWidth - 32;

  doc.setTextColor(17, 34, 56);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("THEORY ATTENDANCE", left, 20);
  doc.setFontSize(8);
  doc.setTextColor(65, 86, 111);
  doc.text("APOLLO GLOBAL ACADEMY", left, 26);

  if (logo) {
    const ratio = logo.naturalWidth / Math.max(1, logo.naturalHeight);
    const height = 15;
    const width = Math.min(50, height * ratio);
    doc.addImage(logo, "PNG", pageWidth - left - width, 10, width, height);
  }
  doc.setDrawColor(0, 111, 136);
  doc.setLineWidth(0.7);
  doc.line(left, 31, pageWidth - left, 31);

  let y = 36;
  const labelWidth = 32;
  const valueWidth = contentWidth / 2 - labelWidth;
  cell(doc, "Course Title", left, y, labelWidth, 9, { bold: true, fill: [225, 239, 246] });
  cell(doc, session.courseName, left + labelWidth, y, valueWidth, 9, { fontSize: 8.5 });
  cell(doc, "Course Code", left + labelWidth + valueWidth, y, labelWidth, 9, { bold: true, fill: [225, 239, 246] });
  cell(doc, session.courseCode || "-", left + labelWidth * 2 + valueWidth, y, valueWidth, 9, { fontSize: 8.5 });
  y += 9;
  cell(doc, "Course Date", left, y, labelWidth, 9, { bold: true, fill: [225, 239, 246] });
  cell(doc, formatDate(session.courseDate), left + labelWidth, y, valueWidth, 9, { fontSize: 8.5 });
  cell(doc, "Instructor", left + labelWidth + valueWidth, y, labelWidth, 9, { bold: true, fill: [225, 239, 246] });
  cell(doc, session.instructorName, left + labelWidth * 2 + valueWidth, y, valueWidth, 9, { fontSize: 8.5 });
  y += 14;

  const widths = [13, 58, 39, 37, 37];
  const headers = [
    "S/N",
    "Trainee Name",
    "NRIC/FIN/Travel Doc. ref. no. (Last 4 characters)",
    "Trainee Signature AM",
    "Trainee Signature PM"
  ];
  let x = left;
  headers.forEach((header, index) => {
    cell(doc, header, x, y, widths[index], 16, { bold: true, center: true, fill: [209, 227, 240], fontSize: 7.2 });
    x += widths[index];
  });
  y += 16;

  for (let index = 0; index < ROWS_PER_PAGE; index += 1) {
    const row = rows[index];
    x = left;
    const rowHeight = 11.5;
    cell(doc, row ? String((pageNumber - 1) * ROWS_PER_PAGE + index + 1) : "", x, y, widths[0], rowHeight, { center: true });
    x += widths[0];
    cell(doc, row?.name || "", x, y, widths[1], rowHeight, { fontSize: 8.2 });
    x += widths[1];
    cell(doc, row?.lastFour || "", x, y, widths[2], rowHeight, { center: true, fontSize: 8.2 });
    x += widths[2];
    cell(doc, "", x, y, widths[3], rowHeight);
    if (row) await drawSignature(doc, row.amSignature, x, y, widths[3], rowHeight);
    x += widths[3];
    cell(doc, "", x, y, widths[4], rowHeight);
    if (row) await drawSignature(doc, row.pmSignature, x, y, widths[4], rowHeight);
    y += rowHeight;
  }

  y += 7;
  cell(doc, "TRAINER USE ONLY: Incidents / Comments / Observations", left, y, contentWidth, 8, {
    bold: true,
    fill: [225, 239, 246],
    fontSize: 8
  });
  y += 8;
  cell(doc, pageNumber === pageCount ? session.trainerComments : "Continued on final page", left, y, contentWidth, 24, { fontSize: 8 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(65, 86, 111);
  doc.text(
    "By signing this attendance sheet, you confirm your attendance at the training session detailed above.",
    left,
    pageHeight - 15
  );
  doc.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - left, pageHeight - 9, { align: "right" });
}

export async function createAttendancePdf(session: AttendanceSession, submissions: AttendanceSubmission[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const logo = await loadImage(LOGO_PATH);
  const learners = mergeSubmissions(submissions);
  const pageCount = Math.max(1, Math.ceil(learners.length / ROWS_PER_PAGE));
  for (let page = 0; page < pageCount; page += 1) {
    if (page > 0) doc.addPage("letter", "portrait");
    await drawPage(
      doc,
      session,
      learners.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE),
      page + 1,
      pageCount,
      logo
    );
  }
  return doc;
}

export function attendancePdfFileName(session: AttendanceSession) {
  return `${safeFileName(session.courseName || "Course")} - Attendance - ${session.courseDate}.pdf`;
}

export async function downloadAttendancePdf(session: AttendanceSession, submissions: AttendanceSubmission[]) {
  const doc = await createAttendancePdf(session, submissions);
  doc.save(attendancePdfFileName(session));
}
