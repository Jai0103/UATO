import jsPDF from "jspdf";
import type { FlightLogRow, StudentDetails } from "@/lib/flight-log-storage";

export type FlightLogPdfData = {
  student: StudentDetails;
  rows: FlightLogRow[];
};

function safeFileName(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ");
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
    baseline: "top"
  });
}

export function generateFlightLogPdf(data: FlightLogPdfData) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

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

  y += 7;

  doc.text(
    `Student Signature Name: ${data.student.studentSignatureName || "-"}`,
    margin,
    y
  );

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
    { label: "Remarks", width: 34 }
  ];

  const headerHeight = 12;
  const rowHeight = 16;
  let x = margin;

  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.2);

  columns.forEach((column) => {
    drawCell(doc, column.label, x, y, column.width, headerHeight, {
      bold: true,
      align: "center",
      fontSize: 7
    });
    x += column.width;
  });

  y += headerHeight;

  const usablePageHeight = doc.internal.pageSize.getHeight() - 18;

  data.rows.forEach((row) => {
    if (y + rowHeight > usablePageHeight) {
      doc.addPage();
      y = 10;
      x = margin;

      columns.forEach((column) => {
        drawCell(doc, column.label, x, y, column.width, headerHeight, {
          bold: true,
          align: "center",
          fontSize: 7
        });
        x += column.width;
      });

      y += headerHeight;
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
      row.remarks
    ];

    x = margin;

    values.forEach((value, index) => {
      drawCell(doc, value, x, y, columns[index].width, rowHeight);
      x += columns[index].width;
    });

    y += rowHeight;
  });

  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Student Signature:", margin, y);
  doc.line(45, y, 110, y);

  doc.text("AFE / Instructor Signature:", 150, y);
  doc.line(190, y, 270, y);

  const studentName = safeFileName(data.student.studentName || "Student");
  doc.save(`${studentName} (FLIGHT LOG).pdf`);
}
