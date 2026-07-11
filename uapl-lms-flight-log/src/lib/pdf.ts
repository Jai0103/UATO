import jsPDF from "jspdf";
import type {
  FlightLogRecord,
  FlightLogRow,
  StudentDetails
} from "@/lib/flight-log-storage";

export type FlightLogPdfData = {
  student: StudentDetails;
  rows: FlightLogRow[];
};

type PdfSource = FlightLogRecord | FlightLogPdfData;

type ColumnDefinition = {
  label: string;
  width: number;
  align?: "left" | "center";
};

const PAGE_MARGIN = 8;
const PAGE_WIDTH = 297;
const PAGE_HEIGHT = 210;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

const TABLE_HEADER_HEIGHT = 14;
const TABLE_ROW_HEIGHT = 14;

const columns: ColumnDefinition[] = [
  { label: "Date\n(DD/MM/YY)", width: 20, align: "center" },
  { label: "Location\n(KR/OHR/TRC)", width: 25, align: "center" },
  { label: "Start\n(HH:MM)", width: 18, align: "center" },
  { label: "Duration\n(MIN)", width: 19, align: "center" },
  { label: "UA Model & S/N", width: 32 },
  {
    label: "UA Category\n(M7/M25/H25)",
    width: 23,
    align: "center"
  },
  { label: "Battery\nS/N", width: 26 },
  {
    label: "Pilot in Command\n(INITIALS)",
    width: 32
  },
  {
    label: "AFE / Instructor\nin Command",
    width: 37
  },
  { label: "Remarks", width: 49 }
];

let cachedLogoImage: HTMLImageElement | null = null;

function getLogoUrl() {
  if (typeof window === "undefined") return "";

  const nextScript = Array.from(document.scripts).find((script) =>
    script.src.includes("/_next/")
  );

  if (nextScript) {
    const scriptUrl = new URL(nextScript.src);
    const basePath = scriptUrl.pathname.split("/_next/")[0];

    return `${scriptUrl.origin}${basePath}/apollo-global-academy-logo.png`;
  }

  return `${window.location.origin}/apollo-global-academy-logo.png`;
}

function preloadLogo() {
  if (typeof window === "undefined" || cachedLogoImage) return;

  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = getLogoUrl();

  cachedLogoImage = image;
}

preloadLogo();

export function safePdfFileName(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeSource(source: PdfSource): FlightLogPdfData {
  return {
    student: source.student,
    rows: source.rows
  };
}

function formatReportDate(value?: string) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function formatFlightDate(value: string) {
  if (!value) return "";

  const parts = value.split("-");

  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
  }

  return value;
}

function drawLogo(doc: jsPDF) {
  const logoWidth = 46;
  const logoHeight = 18;
  const logoX = PAGE_WIDTH - PAGE_MARGIN - logoWidth;
  const logoY = 7;

  const logoImage = cachedLogoImage;

  if (
    logoImage !== null &&
    logoImage.complete &&
    logoImage.naturalWidth > 0
  ) {
    try {
      doc.addImage(
        logoImage,
        "PNG",
        logoX,
        logoY,
        logoWidth,
        logoHeight,
        undefined,
        "FAST"
      );

      return;
    } catch {
      // Use the text fallback below.
    }
  }

  doc.setDrawColor(30, 64, 175);
  doc.setLineWidth(0.5);
  doc.roundedRect(logoX, logoY, logoWidth, logoHeight, 2, 2);

  doc.setTextColor(30, 64, 175);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);

  doc.text(
    "APOLLO GLOBAL",
    logoX + logoWidth / 2,
    logoY + 7,
    { align: "center" }
  );

  doc.setFontSize(7);

  doc.text(
    "ACADEMY",
    logoX + logoWidth / 2,
    logoY + 12,
    { align: "center" }
  );

  doc.setTextColor(15, 23, 42);
}

function drawTitleAndLogo(doc: jsPDF) {
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");

  doc.setFontSize(13);
  doc.text("ADA-UATO-2B", PAGE_MARGIN, 12);

  doc.setFontSize(20);
  doc.text("FLIGHT LOG", PAGE_MARGIN, 22);

  drawLogo(doc);

  doc.setDrawColor(30, 64, 175);
  doc.setLineWidth(0.8);
  doc.line(PAGE_MARGIN, 29, PAGE_WIDTH - PAGE_MARGIN, 29);
}

function drawIdentityCell(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  labelWidth: number
) {
  doc.setFillColor(222, 235, 246);
  doc.rect(x, y, labelWidth, height, "F");

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.25);
  doc.rect(x, y, width, height, "S");

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.6);

  doc.text(label, x + 2.5, y + height / 2, {
    baseline: "middle",
    maxWidth: labelWidth - 5
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);

  doc.text(value || "-", x + labelWidth + 3, y + height / 2, {
    baseline: "middle",
    maxWidth: width - labelWidth - 6
  });
}

function drawSignatureIdentityCell(
  doc: jsPDF,
  signatureDataUrl: string,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const labelWidth = 29;

  doc.setFillColor(222, 235, 246);
  doc.rect(x, y, labelWidth, height, "F");

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.25);
  doc.rect(x, y, width, height, "S");

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);

  doc.text("Signature", x + 2.5, y + height / 2, {
    baseline: "middle"
  });

  if (signatureDataUrl) {
    try {
      doc.addImage(
        signatureDataUrl,
        "PNG",
        x + labelWidth + 3,
        y + 1,
        width - labelWidth - 6,
        height - 2,
        undefined,
        "FAST"
      );

      return;
    } catch {
      // Leave the field blank if the signature cannot be loaded.
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);

  doc.text("-", x + labelWidth + 4, y + height / 2, {
    baseline: "middle"
  });
}

function drawStudentDetails(
  doc: jsPDF,
  student: StudentDetails,
  startY: number
) {
  const leftWidth = 175;
  const rightWidth = CONTENT_WIDTH - leftWidth;
  const rowHeight = 13;

  drawIdentityCell(
    doc,
    "Name as per NRIC/PASSPORT",
    student.studentName,
    PAGE_MARGIN,
    startY,
    leftWidth,
    rowHeight,
    45
  );

  drawSignatureIdentityCell(
    doc,
    student.studentSignatureDataUrl,
    PAGE_MARGIN + leftWidth,
    startY,
    rightWidth,
    rowHeight
  );

  drawIdentityCell(
    doc,
    "Company/Organisation",
    student.company,
    PAGE_MARGIN,
    startY + rowHeight,
    leftWidth,
    rowHeight,
    45
  );

  drawIdentityCell(
    doc,
    "NRIC/FIN/Travel Doc. ref. no.",
    student.lastFourCharacters,
    PAGE_MARGIN + leftWidth,
    startY + rowHeight,
    rightWidth,
    rowHeight,
    55
  );

  return startY + rowHeight * 2;
}

function drawTableHeader(doc: jsPDF, y: number) {
  let x = PAGE_MARGIN;

  columns.forEach((column) => {
    doc.setFillColor(222, 235, 246);
    doc.rect(x, y, column.width, TABLE_HEADER_HEIGHT, "F");

    doc.setDrawColor(71, 85, 105);
    doc.setLineWidth(0.25);
    doc.rect(x, y, column.width, TABLE_HEADER_HEIGHT, "S");

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);

    const lines = column.label.split("\n");
    const lineHeight = 3.3;
    const totalTextHeight = lines.length * lineHeight;

    const textY =
      y +
      TABLE_HEADER_HEIGHT / 2 -
      totalTextHeight / 2 +
      lineHeight -
      0.3;

    doc.text(lines, x + column.width / 2, textY, {
      align: "center",
      lineHeightFactor: 1,
      maxWidth: column.width - 2
    });

    x += column.width;
  });

  return y + TABLE_HEADER_HEIGHT;
}

function getRowValues(row: FlightLogRow) {
  return [
    formatFlightDate(row.date),
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
}

function drawTableRow(
  doc: jsPDF,
  row: FlightLogRow,
  y: number,
  rowIndex: number
) {
  const values = getRowValues(row);
  let x = PAGE_MARGIN;

  columns.forEach((column, columnIndex) => {
    if (rowIndex % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(x, y, column.width, TABLE_ROW_HEIGHT, "F");
    }

    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.2);
    doc.rect(x, y, column.width, TABLE_ROW_HEIGHT, "S");

    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);

    const value = values[columnIndex] || "";

    const lines = doc
      .splitTextToSize(value, column.width - 3)
      .slice(0, 3);

    const lineHeight = 3.5;
    const textHeight = Math.max(lines.length, 1) * lineHeight;

    const textY =
      y +
      TABLE_ROW_HEIGHT / 2 -
      textHeight / 2 +
      lineHeight -
      0.6;

    doc.text(
      lines,
      column.align === "center"
        ? x + column.width / 2
        : x + 1.7,
      textY,
      {
        align: column.align || "left",
        lineHeightFactor: 1.05,
        maxWidth: column.width - 3
      }
    );

    x += column.width;
  });

  return y + TABLE_ROW_HEIGHT;
}

function drawPageFooter(doc: jsPDF, pageNumber: number) {
  const footerY = PAGE_HEIGHT - 5.5;

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(
    PAGE_MARGIN,
    footerY - 3,
    PAGE_WIDTH - PAGE_MARGIN,
    footerY - 3
  );

  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);

  doc.text(
    "ADA-UATO-2B | Flight Log",
    PAGE_MARGIN,
    footerY
  );

  doc.text(
    `Page ${pageNumber}`,
    PAGE_WIDTH - PAGE_MARGIN,
    footerY,
    { align: "right" }
  );
}

function drawContinuationHeader(
  doc: jsPDF,
  student: StudentDetails,
  pageNumber: number
) {
  drawTitleAndLogo(doc);

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  doc.text(
    `Student: ${student.studentName || "-"} | Company: ${
      student.company || "-"
    }`,
    PAGE_MARGIN,
    35
  );

  doc.setFont("helvetica", "bold");

  doc.text(
    "CONTINUED",
    PAGE_WIDTH - PAGE_MARGIN,
    35,
    { align: "right" }
  );

  drawPageFooter(doc, pageNumber);

  return drawTableHeader(doc, 40);
}

function getEmptyRow(): FlightLogRow {
  return {
    date: "",
    location: "",
    startTime: "",
    duration: "",
    uaModel: "",
    uaCategory: "",
    batterySn: "",
    pilotInCommand: "",
    instructorInCommand: "",
    remarks: ""
  };
}

function addFlightLogPages(
  doc: jsPDF,
  source: PdfSource,
  addFirstPage: boolean
) {
  const data = normalizeSource(source);

  if (addFirstPage) {
    doc.addPage("a4", "landscape");
  }

  let studentPageNumber = 1;

  drawTitleAndLogo(doc);

  const detailsBottom = drawStudentDetails(
    doc,
    data.student,
    34
  );

  let y = drawTableHeader(doc, detailsBottom + 4);

  drawPageFooter(doc, studentPageNumber);

  const rowsToDraw: FlightLogRow[] =
    data.rows.length > 0 ? data.rows : [getEmptyRow()];

  rowsToDraw.forEach((row, rowIndex) => {
    if (y + TABLE_ROW_HEIGHT > PAGE_HEIGHT - 13) {
      doc.addPage("a4", "landscape");

      studentPageNumber += 1;

      y = drawContinuationHeader(
        doc,
        data.student,
        studentPageNumber
      );
    }

    y = drawTableRow(doc, row, y, rowIndex);
  });
}

function createDocument() {
  return new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true
  });
}

export function createSingleFlightLogPdf(
  source: PdfSource
) {
  const doc = createDocument();

  addFlightLogPages(doc, source, false);

  return doc;
}

function drawCombinedCover(
  doc: jsPDF,
  records: FlightLogRecord[]
) {
  drawTitleAndLogo(doc);

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);

  doc.text(
    "COMBINED FLIGHT LOG REPORT",
    PAGE_WIDTH / 2,
    66,
    { align: "center" }
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);

  doc.text(
    `${records.length} student record${
      records.length === 1 ? "" : "s"
    } included`,
    PAGE_WIDTH / 2,
    77,
    { align: "center" }
  );

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(64, 90, 169, 52, 2, 2, "F");

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.roundedRect(64, 90, 169, 52, 2, 2, "S");

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);

  doc.text("STUDENTS INCLUDED", 72, 101);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  records.slice(0, 12).forEach((record, index) => {
    const columnIndex = index >= 6 ? 1 : 0;
    const rowIndex = index % 6;

    const x = columnIndex === 0 ? 72 : 153;
    const y = 111 + rowIndex * 5;

    doc.text(
      `${index + 1}. ${
        record.student.studentName || "Unnamed Student"
      }`,
      x,
      y,
      { maxWidth: 73 }
    );
  });

  if (records.length > 12) {
    doc.setFont("helvetica", "italic");

    doc.text(
      `and ${records.length - 12} more student records`,
      PAGE_WIDTH / 2,
      151,
      { align: "center" }
    );
  }

  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  doc.text(
    `Generated on ${new Date().toLocaleString()}`,
    PAGE_WIDTH / 2,
    174,
    { align: "center" }
  );

  drawPageFooter(doc, 1);
}

export function createCombinedFlightLogPdf(
  records: FlightLogRecord[]
) {
  const doc = createDocument();

  if (records.length === 0) {
    drawCombinedCover(doc, []);

    return doc;
  }

  if (records.length > 1) {
    drawCombinedCover(doc, records);

    records.forEach((record) => {
      addFlightLogPages(doc, record, true);
    });

    return doc;
  }

  addFlightLogPages(doc, records[0], false);

  return doc;
}

export function generateFlightLogPdf(
  data: FlightLogPdfData
) {
  const doc = createSingleFlightLogPdf(data);

  const studentName = safePdfFileName(
    data.student.studentName || "Student"
  );

  const reportDate = formatReportDate();

  doc.save(
    `${studentName} - FLIGHT LOG - ${reportDate}.pdf`
  );
}

export function getPdfBlob(doc: jsPDF) {
  return doc.output("blob");
}

export function getPdfBase64(doc: jsPDF) {
  const dataUri = String(doc.output("datauristring"));

  return dataUri.includes(",")
    ? dataUri.split(",")[1]
    : dataUri;
}
