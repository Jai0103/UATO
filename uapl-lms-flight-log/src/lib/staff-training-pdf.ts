import jsPDF from "jspdf";
import {
  STAFF_TRAINING_LABELS,
  STAFF_TRAINING_TYPES,
  type StaffTrainingEntry,
  type StaffTrainingRecord,
  type StaffTrainingType
} from "@/lib/staff-training";

const LOGO_PATH = "/UATO/apollo-global-academy-logo.png";
const FORM_CODE = "ADA-UATO-3-1B";

function safeFileName(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ");
}

function formatDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function statusLabel(value: StaffTrainingEntry["status"]) {
  if (!value) return "";
  if (value === "completed") return "Completed";
  if (value === "in_progress") return "In Progress";
  return "Not Completed";
}

async function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawTextCell(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    align?: "left" | "center";
    bold?: boolean;
    fill?: [number, number, number];
    fontSize?: number;
  } = {}
) {
  if (options.fill) {
    doc.setFillColor(...options.fill);
    doc.rect(x, y, width, height, "F");
  }

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.25);
  doc.rect(x, y, width, height);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", options.bold ? "bold" : "normal");
  doc.setFontSize(options.fontSize || 7.6);

  const lines = doc.splitTextToSize(text || "", width - 3);
  const lineHeight = (options.fontSize || 7.6) * 0.38;
  const contentHeight = Math.min(lines.length, 3) * lineHeight;
  const textY = y + Math.max(1.7, (height - contentHeight) / 2 + 1.7);

  doc.text(lines.slice(0, 3), options.align === "center" ? x + width / 2 : x + 1.5, textY, {
    align: options.align || "left"
  });
}

function drawPageHeader(
  doc: jsPDF,
  record: StaffTrainingRecord,
  logo: HTMLImageElement | null
) {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Staff Internal Training", 10, 12);
  doc.text("Checklist", 10, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(FORM_CODE, 10, 23);

  if (logo) {
    const ratio = logo.naturalWidth / Math.max(logo.naturalHeight, 1);
    const height = 15;
    const width = Math.min(48, height * ratio);
    doc.addImage(logo, "PNG", pageWidth - 10 - width, 7, width, height);
  }

  doc.setDrawColor(148, 163, 184);
  doc.line(10, 26, pageWidth - 10, 26);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("Name:", 10, 32);
  doc.text("Email:", 105, 32);
  doc.text("Designation:", 205, 32);

  doc.setFont("helvetica", "normal");
  doc.text(record.staffName || "-", 24, 32);
  doc.text(record.staffEmail || "-", 119, 32);
  doc.text(record.designation || "-", 229, 32);

  return 36;
}

function drawTableHeader(doc: jsPDF, y: number) {
  const columns = [
    { label: "S/N", width: 14 },
    { label: "Description", width: 108 },
    { label: "Status", width: 37 },
    { label: "Date Completed", width: 36 },
    { label: "Remarks", width: 82 }
  ];

  let x = 10;
  columns.forEach((column) => {
    drawTextCell(doc, column.label, x, y, column.width, 8, {
      align: "center",
      bold: true,
      fill: [226, 232, 240],
      fontSize: 8
    });
    x += column.width;
  });

  return y + 8;
}

function drawSection(
  doc: jsPDF,
  type: StaffTrainingType,
  items: StaffTrainingEntry[],
  startY: number
) {
  let y = startY;
  drawTextCell(doc, STAFF_TRAINING_LABELS[type], 10, y, 277, 7, {
    align: "center",
    bold: true,
    fill: [198, 217, 241],
    fontSize: 9.5
  });
  y += 7;

  items.forEach((item, index) => {
    const descriptionLines = doc.splitTextToSize(item.description, 104);
    const remarksLines = doc.splitTextToSize(item.remarks || "", 78);
    const rowHeight = Math.max(
      6.5,
      Math.min(10.5, Math.max(descriptionLines.length, remarksLines.length) * 3.25 + 1.5)
    );
    let x = 10;
    const values = [
      String(index + 1),
      item.description,
      statusLabel(item.status),
      formatDate(item.dateCompleted),
      item.remarks
    ];
    const widths = [14, 108, 37, 36, 82];

    values.forEach((value, cellIndex) => {
      drawTextCell(doc, value, x, y, widths[cellIndex], rowHeight, {
        align: cellIndex === 0 || cellIndex === 2 || cellIndex === 3 ? "center" : "left",
        bold: cellIndex === 0,
        fontSize: 7.4
      });
      x += widths[cellIndex];
    });
    y += rowHeight;
  });

  return y;
}

function drawFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(FORM_CODE, 10, 204);
    doc.text(`Page ${page} of ${pageCount}`, 287, 204, { align: "right" });
  }
}

export async function createStaffTrainingPdf(record: StaffTrainingRecord) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });
  const logo = await loadImage(LOGO_PATH);
  let y = drawPageHeader(doc, record, logo);
  y = drawTableHeader(doc, y);

  STAFF_TRAINING_TYPES.forEach((type) => {
    const items = record.items
      .filter((item) => item.trainingType === type)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const estimatedHeight =
      7 +
      items.reduce(
        (total, item) =>
          total +
          Math.max(
            6.5,
            Math.min(
              10.5,
              Math.max(
                doc.splitTextToSize(item.description, 104).length,
                doc.splitTextToSize(item.remarks || "", 78).length
              ) *
                3.25 +
                1.5
            )
          ),
        0
      );

    if (y + estimatedHeight > 177) {
      doc.addPage();
      y = drawPageHeader(doc, record, logo);
      y = drawTableHeader(doc, y);
    }

    y = drawSection(doc, type, items, y);
  });

  if (y > 177) {
    doc.addPage();
    y = drawPageHeader(doc, record, logo);
  }

  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("Checked by Head of Training", 10, y);
  doc.setFont("helvetica", "normal");
  doc.text(`Name / Signature: ${record.headOfTrainingName || "-"}`, 10, y + 7);

  if (record.signatureDataUrl) {
    const signature = await loadImage(record.signatureDataUrl);
    if (signature) {
      doc.addImage(signature, "PNG", 72, y - 4, 52, 15);
    }
  }
  doc.line(70, y + 8, 132, y + 8);

  drawFooter(doc);
  return doc;
}

export function staffTrainingPdfFileName(record: StaffTrainingRecord) {
  const name = safeFileName(record.staffName || "Staff");
  const date = new Date().toISOString().slice(0, 10);
  return `${name} - STAFF INTERNAL TRAINING - ${date}.pdf`;
}
