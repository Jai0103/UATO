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

const brandBlue = "#deebf6";
const darkInk = "#111827";
const borderInk = "#000000";

export function safePdfFileName(studentName: string) {
  const cleanName =
    studentName
      .trim()
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ") || "Student";

  const date = new Date().toISOString().slice(0, 10);

  return `${cleanName} - FLIGHT LOG - ${date}.pdf`;
}

function formatToday() {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date());
}

function drawText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  options?: {
    bold?: boolean;
    size?: number;
    align?: "left" | "center" | "right";
  }
) {
  doc.setFont("helvetica", options?.bold ? "bold" : "normal");
  doc.setFontSize(options?.size ?? 8);
  doc.setTextColor(darkInk);
  doc.text(text || "-", x, y, {
    align: options?.align ?? "left",
  });
}

function drawFieldBox(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number
) {
  doc.setDrawColor(borderInk);
  doc.setLineWidth(0.25);
  doc.rect(x, y, width, height);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text(label, x + 2, y + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const lines = doc.splitTextToSize(value || "-", width - 4);
  doc.text(lines.slice(0, 2), x + 2, y + 10);
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
    fill?: string;
  }
) {
  if (options?.fill) {
    doc.setFillColor(options.fill);
    doc.rect(x, y, width, height, "F");
  }

  doc.setDrawColor(borderInk);
  doc.setLineWidth(0.2);
  doc.rect(x, y, width, height);

  doc.setFont("helvetica", options?.bold ? "bold" : "normal");
  doc.setFontSize(options?.fontSize ?? 6.5);
  doc.setTextColor(darkInk);

  const lines = doc.splitTextToSize(text || "-", width - 3);
  const textX = options?.align === "center" ? x + width / 2 : x + 1.5;

  doc.text(lines.slice(0, 4), textX, y + 3, {
    align: options?.align ?? "left",
    baseline: "top",
  });
}

function drawReportHeader(doc: jsPDF, data: FlightLogPdfData) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 8;
  let y = 8;

  doc.setDrawColor(borderInk);
  doc.setLineWidth(0.35);

  doc.roundedRect(margin, y, 34, 12, 1, 1);
  drawText(doc, "UAPL", margin + 17, y + 5, {
    bold: true,
    size: 11,
    align: "center",
  });
  drawText(doc, "LMS", margin + 17, y + 9.5, {
    bold: true,
    size: 6.5,
    align: "center",
  });

  drawText(doc, "ATTENDANCE / FLIGHT LOG", pageWidth / 2, y + 5, {
    bold: true,
    size: 13,
    align: "center",
  });
  drawText(doc, "Unmanned Aircraft Practical Training Record", pageWidth / 2, y + 10, {
    size: 8,
    align: "center",
  });

  drawText(doc, `Generated: ${formatToday()}`, pageWidth - margin, y + 6, {
    size: 7.5,
    align: "right",
  });

  y += 17;

  drawFieldBox(
    doc,
    "Name as per NRIC/PASSPORT:",
    data.student.studentName || "-",
    margin,
    y,
    88,
    15
  );

  drawFieldBox(
    doc,
    "Signature:",
    "",
    margin + 88,
    y,
    64,
    15
  );

  if (data.student.studentSignatureDataUrl) {
    try {
      doc.addImage(
        data.student.studentSignatureDataUrl,
        "PNG",
        margin + 91,
        y + 2,
        48,
        10
      );
    } catch {
      // Ignore broken image data so the PDF can still generate.
    }
  }

  drawFieldBox(
    doc,
    "Company/Organisation:",
    data.student.company || "-",
    margin,
    y + 15,
    88,
    15
  );

  drawFieldBox(
    doc,
    "NRIC/FIN/Travel Doc. ref.no.:",
    data.student.lastFourCharacters || "-",
    margin + 88,
    y + 15,
    64,
    15
  );

  return y + 36;
}

function drawPageFooter(doc: jsPDF, pageNumber: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor("#475569");

  doc.text("UAPL LMS Flight Log", 8, pageHeight - 6);
  doc.text(`Page ${pageNumber}`, pageWidth - 8, pageHeight - 6, {
    align: "right",
  });
}

function addFlightLogToDoc(
  doc: jsPDF,
  data: FlightLogPdfData,
  isFirst: boolean
) {
  if (!isFirst) {
    doc.addPage();
  }

  let pageNumber = doc.getNumberOfPages();
  let y = drawReportHeader(doc, data);

  const margin = 8;
  const usablePageHeight = doc.internal.pageSize.getHeight() - 15;

  const columns = [
    { label: "Date\n(DD/MM/YY)", width: 22 },
    { label: "Location\n(KR/OHR/TRC)", width: 24 },
    { label: "Start\n(HH:MM)", width: 21 },
    { label: "Duration\n(MIN)", width: 21 },
    { label: "UA Model & S/N", width: 35 },
    { label: "UA\nCategory\n(M7/M25/H)", width: 25 },
    { label: "Battery\nS/N", width: 27 },
    { label: "Pilot in Command\n(INITIALS)", width: 34 },
    { label: "AFE / Instructor\nin Command", width: 38 },
    { label: "Remarks", width: 34 },
  ];

  const headerHeight = 14;
  const rowHeight = 14;

  function drawTableHeader() {
    let x = margin;

    columns.forEach((column) => {
      drawCell(doc, column.label, x, y, column.width, headerHeight, {
        bold: true,
        align: "center",
        fontSize: 6.4,
        fill: brandBlue,
      });
      x += column.width;
    });

    y += headerHeight;
  }

  drawTableHeader();

  const rowsToDraw =
    data.rows.length > 0
      ? data.rows
      : [
          {
            date: "",
            location: "",
            startTime: "",
            duration: "",
            uaModel: "",
            uaCategory: "",
            batterySn: "",
            pilotInCommand: "",
            instructorInCommand: "",
            remarks: "",
          },
        ];

  rowsToDraw.forEach((row) => {
    if (y + rowHeight > usablePageHeight) {
      drawPageFooter(doc, pageNumber);
      doc.addPage();
      pageNumber = doc.getNumberOfPages();
      y = 10;
      drawTableHeader();
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
      drawCell(doc, value, x, y, columns[index].width, rowHeight, {
        align: index <= 3 || index === 5 ? "center" : "left",
        fontSize: 6.5,
      });
      x += columns[index].width;
    });

    y += rowHeight;
  });

  y += 8;

  if (y + 18 > usablePageHeight) {
    drawPageFooter(doc, pageNumber);
    doc.addPage();
    pageNumber = doc.getNumberOfPages();
    y = 18;
  }

  doc.setDrawColor(borderInk);
  doc.setLineWidth(0.25);

  drawText(doc, "Student Signature:", margin, y, {
    bold: true,
    size: 8,
  });

  doc.line(margin + 34, y, margin + 100, y);

  if (data.student.studentSignatureDataUrl) {
    try {
      doc.addImage(
        data.student.studentSignatureDataUrl,
        "PNG",
        margin + 36,
        y - 13,
        54,
        12
      );
    } catch {
      // Ignore broken image data.
    }
  }

  drawText(doc, "AFE / Instructor Signature:", 158, y, {
    bold: true,
    size: 8,
  });

  doc.line(198, y, 280, y);

  drawPageFooter(doc, pageNumber);
}

function addCombinedCoverPage(doc: jsPDF, records: FlightLogRecord[]) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;

  doc.setFillColor("#f8fafc");
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  doc.setDrawColor(borderInk);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, 18, pageWidth - margin * 2, pageHeight - 36, 2, 2);

  drawText(doc, "UAPL LMS", pageWidth / 2, 38, {
    bold: true,
    size: 22,
    align: "center",
  });

  drawText(doc, "COMBINED FLIGHT LOG REPORT", pageWidth / 2, 50, {
    bold: true,
    size: 16,
    align: "center",
  });

  drawText(doc, `Generated: ${formatToday()}`, pageWidth / 2, 60, {
    size: 9,
    align: "center",
  });

  const totalFlights = records.reduce((sum, record) => sum + record.rows.length, 0);

  drawFieldBox(doc, "Total Students", String(records.length), 54, 78, 55, 18);
  drawFieldBox(doc, "Total Flight Entries", String(totalFlights), 121, 78, 55, 18);
  drawFieldBox(doc, "Report Type", "Combined PDF", 188, 78, 55, 18);

  let y = 112;

  drawText(doc, "Included Students", margin + 8, y, {
    bold: true,
    size: 11,
  });

  y += 7;

  const columns = [
    { label: "No.", width: 16 },
    { label: "Student", width: 82 },
    { label: "Company", width: 72 },
    { label: "Last 4", width: 32 },
    { label: "Flights", width: 28 },
  ];

  let x = margin + 8;

  columns.forEach((column) => {
    drawCell(doc, column.label, x, y, column.width, 10, {
      bold: true,
      align: "center",
      fill: brandBlue,
      fontSize: 7,
    });
    x += column.width;
  });

  y += 10;

  records.slice(0, 15).forEach((record, index) => {
    x = margin + 8;

    const values = [
      String(index + 1),
      record.student.studentName || "-",
      record.student.company || "-",
      record.student.lastFourCharacters || "-",
      String(record.rows.length),
    ];

    values.forEach((value, valueIndex) => {
      drawCell(doc, value, x, y, columns[valueIndex].width, 9, {
        align: valueIndex === 0 || valueIndex >= 3 ? "center" : "left",
        fontSize: 6.8,
      });
      x += columns[valueIndex].width;
    });

    y += 9;
  });

  if (records.length > 15) {
    drawText(doc, `+ ${records.length - 15} more student(s) included`, margin + 8, y + 6, {
      size: 8,
    });
  }

  drawPageFooter(doc, 1);
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

  if (records.length > 1) {
    addCombinedCoverPage(doc, records);

    records.forEach((record) => {
      addFlightLogToDoc(
        doc,
        {
          student: record.student,
          rows: record.rows,
        },
        false
      );
    });

    return doc;
  }

  if (records[0]) {
    addFlightLogToDoc(
      doc,
      {
        student: records[0].student,
        rows: records[0].rows,
      },
      true
    );
  }

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
