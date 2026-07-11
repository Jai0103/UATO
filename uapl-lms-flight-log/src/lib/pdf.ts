import jsPDF from "jspdf";
import type {
  FlightLogRecord,
  FlightLogRow,
  StudentDetails,
} from "@/lib/flight-log-storage";

export type FlightLogPdfData = {
  student: StudentDetails;
  rows: FlightLogRow[];
};

export function safePdfFileName(studentName: string) {
  const cleanName =
    studentName
      .trim()
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ") || "Student";

  const date = new Date().toISOString().slice(0, 10);

  return `${cleanName} - FLIGHT LOG - ${date}.pdf`;
}

function drawCell(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options?: {
    bold?: boolean;
    align?: "left" | "center";
    fontSize?: number;
  }
) {
  doc.rect(x, y, width, height);
  doc.setFont("helvetica", options?.bold ? "bold" : "normal");
  doc.setFontSize(options?.fontSize ?? 7);

  const lines = doc.splitTextToSize(text || "", width - 4);
  const textX = options?.align === "center" ? x + width / 2 : x + 2;

  doc.text(lines.slice(0, 3), textX, y + 3, {
    align: options?.align ?? "left",
    baseline: "top",
  });
}

function addFlightLogToDoc(doc: jsPDF, data: FlightLogPdfData, isFirst: boolean) {
  if (!isFirst) {
    doc.addPage();
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  let y = 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("UAPL LMS FLIGHT LOG", pageWidth / 2, y, { align: "center" });

  y += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Student Name: ${data.student.studentName || "-"}`, margin, y);
  doc.text(`Company: ${data.student.company || "-"}`, 110, y);
  doc.text(`Last 4 Characters: ${data.student.lastFourCharacters || "-"}`, 210, y);

  y += 8;

  const columns = [
    { label: "Date", width: 22 },
    { label: "Location", width: 28 },
    { label: "Start Time", width: 22 },
    { label: "Duration\n(Mins)", width: 23 },
    { label: "UA Model & S/N", width: 34 },
    { label: "UA Category", width: 25 },
    { label: "Battery S/N", width: 28 },
    { label: "Pilot in Command", width: 35 },
    { label: "AFE / Instructor", width: 36 },
    { label: "Remarks", width: 34 },
  ];

  const headerHeight = 12;
  const rowHeight = 16;
  const usablePageHeight = doc.internal.pageSize.getHeight() - 18;

  function drawHeader() {
    let x = margin;

    columns.forEach((column) => {
      drawCell(doc, column.label, x, y, column.width, headerHeight, {
        bold: true,
        align: "center",
        fontSize: 7,
      });
      x += column.width;
    });

    y += headerHeight;
  }

  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.2);

  drawHeader();

  data.rows.forEach((row) => {
    if (y + rowHeight > usablePageHeight) {
      doc.addPage();
      y = 10;
      drawHeader();
    }

    const values = [
      row.date,
      row.location,
      row.startTime,
      row.duration,
      row.uaModel,
      row.uaCategory,
      row.batterySn,
      row.pilotInCommand,
      row.instructorInCommand,
      row.remarks,
    ];

    let x = margin;

    values.forEach((value, index) => {
      drawCell(doc, value, x, y, columns[index].width, rowHeight);
      x += columns[index].width;
    });

    y += rowHeight;
  });

  y += 10;

  if (y > usablePageHeight - 20) {
    doc.addPage();
    y = 20;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Student Signature:", margin, y);

  if (data.student.studentSignatureDataUrl) {
    doc.addImage(data.student.studentSignatureDataUrl, "PNG", 45, y - 12, 55, 16);
  }

  doc.line(45, y, 110, y);
  doc.text("AFE / Instructor Signature:", 150, y);
  doc.line(190, y, 270, y);
}

export function createSingleFlightLogPdf(data: FlightLogPdfData) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  addFlightLogToDoc(doc, data, true);

  return doc;
}

export function createCombinedFlightLogPdf(records: FlightLogRecord[]) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  records.forEach((record, index) => {
    addFlightLogToDoc(
      doc,
      {
        student: record.student,
        rows: record.rows,
      },
      index === 0
    );
  });

  return doc;
}

export function generateFlightLogPdf(data: FlightLogPdfData) {
  const doc = createSingleFlightLogPdf(data);
  doc.save(safePdfFileName(data.student.studentName));
}

export function getPdfBlob(doc: jsPDF) {
  return doc.output("blob");
}

export function getPdfBase64(doc: jsPDF) {
  const dataUri = doc.output("datauristring");
  return dataUri.split(",")[1] || "";
}
