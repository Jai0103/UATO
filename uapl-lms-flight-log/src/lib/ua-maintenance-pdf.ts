import jsPDF from "jspdf";
import type {
  UaMaintenanceEntry,
  UaMaintenanceRecord,
  UaMaintenanceStatus
} from "@/lib/ua-maintenance";

const LOGO_PATH = "/UATO/apollo-global-academy-logo.png";
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 10;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const COPYRIGHT =
  "Copyright 2020 Apollo Global Academy Pte Ltd. All rights reserved.";

async function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function safeFileName(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ");
}

function formatDate(value: string) {
  if (!value) return "";
  const parts = value.split("-");
  return parts.length === 3
    ? `${parts[2]}/${parts[1]}/${parts[0]}`
    : value;
}

function statusLabel(status: UaMaintenanceStatus) {
  if (status === "pass") return "Pass";
  if (status === "fail") return "Fail";
  if (status === "na") return "N/A";
  return "";
}

function containImage(
  image: HTMLImageElement,
  maxWidth: number,
  maxHeight: number
) {
  const sourceWidth = Math.max(image.naturalWidth || image.width, 1);
  const sourceHeight = Math.max(image.naturalHeight || image.height, 1);
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);

  return {
    width: sourceWidth * scale,
    height: sourceHeight * scale
  };
}

function drawHeader(doc: jsPDF, logo: HTMLImageElement | null) {
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Routine UA Maintenance", MARGIN, 15);
  doc.text("Checklist", MARGIN, 22);

  if (logo) {
    const ratio = logo.naturalWidth / Math.max(logo.naturalHeight, 1);
    let height = 15;
    let width = height * ratio;
    if (width > 48) {
      width = 48;
      height = width / ratio;
    }
    doc.addImage(
      logo,
      "PNG",
      PAGE_WIDTH - MARGIN - width,
      7 + (15 - height) / 2,
      width,
      height
    );
  }

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, 27, PAGE_WIDTH - MARGIN, 27);
}

function drawField(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number
) {
  doc.setDrawColor(71, 85, 105);
  doc.setLineWidth(0.25);
  doc.rect(x, y, width, height);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(label, x + 2.5, y + height / 2, { baseline: "middle" });
  const labelWidth = doc.getTextWidth(label) + 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(value || "-", x + labelWidth, y + height / 2, {
    baseline: "middle",
    maxWidth: width - labelWidth - 2
  });
}

function drawTableHeader(doc: jsPDF, y: number) {
  const widths = [14, 106, 27, 43];
  const labels = ["S/N", "Description", "Status", "Remarks"];
  let x = MARGIN;

  labels.forEach((label, index) => {
    doc.setFillColor(226, 232, 240);
    doc.rect(x, y, widths[index], 9, "F");
    doc.setDrawColor(71, 85, 105);
    doc.rect(x, y, widths[index], 9);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(label, x + widths[index] / 2, y + 5.7, { align: "center" });
    x += widths[index];
  });

  return y + 9;
}

function rowHeight(doc: jsPDF, item: UaMaintenanceEntry) {
  const descriptionLines = doc.splitTextToSize(item.description, 102).length;
  const remarkLines = doc.splitTextToSize(item.remarks || "", 39).length;
  return Math.max(9, Math.min(22, Math.max(descriptionLines, remarkLines) * 3.6 + 3));
}

function drawRow(
  doc: jsPDF,
  item: UaMaintenanceEntry,
  index: number,
  y: number
) {
  const widths = [14, 106, 27, 43];
  const values = [
    String(index + 1),
    item.description,
    statusLabel(item.status),
    item.remarks
  ];
  const height = rowHeight(doc, item);
  let x = MARGIN;

  values.forEach((value, cellIndex) => {
    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(x, y, widths[cellIndex], height, "F");
    }
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.2);
    doc.rect(x, y, widths[cellIndex], height);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", cellIndex === 0 ? "bold" : "normal");
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(value || "", widths[cellIndex] - 3);
    const textY = y + Math.max(3.6, (height - lines.length * 3.4) / 2 + 3.1);
    doc.text(
      lines,
      cellIndex === 0 || cellIndex === 2
        ? x + widths[cellIndex] / 2
        : x + 1.5,
      textY,
      {
        align: cellIndex === 0 || cellIndex === 2 ? "center" : "left",
        lineHeightFactor: 1.05,
        maxWidth: widths[cellIndex] - 3
      }
    );
    x += widths[cellIndex];
  });

  return y + height;
}

function drawFooter(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(203, 213, 225);
    doc.line(MARGIN, 287, PAGE_WIDTH - MARGIN, 287);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(COPYRIGHT, MARGIN, 291.5);
    doc.text(`Page ${page} of ${pages}`, PAGE_WIDTH - MARGIN, 291.5, {
      align: "right"
    });
  }
}

export async function createUaMaintenancePdf(record: UaMaintenanceRecord) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const logo = await loadImage(LOGO_PATH);

  function startPage(includeDetails: boolean) {
    drawHeader(doc, logo);
    if (includeDetails) {
      drawField(doc, "UA Brand / Model:", record.uaModel, MARGIN, 32, 137, 10);
      drawField(doc, "Date:", formatDate(record.inspectionDate), 147, 32, 53, 10);
      drawField(doc, "UA ID No.:", record.uaId, MARGIN, 42, CONTENT_WIDTH, 10);
      return drawTableHeader(doc, 57);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`${record.uaModel || "-"} / ${record.uaId || "-"} - CONTINUED`, MARGIN, 34);
    return drawTableHeader(doc, 39);
  }

  let y = startPage(true);
  record.items
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .forEach((item, index) => {
      const height = rowHeight(doc, item);
      if (y + height > 247) {
        doc.addPage("a4", "portrait");
        y = startPage(false);
      }
      y = drawRow(doc, item, index, y);
    });

  if (y > 238) {
    doc.addPage("a4", "portrait");
    y = startPage(false);
  }

  y += 5;
  drawField(doc, "Recommendation:", record.recommendation, MARGIN, y, CONTENT_WIDTH, 13);
  y += 17;

  doc.setDrawColor(71, 85, 105);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  const checkedByLabel = "Checked by (Name / Signature):";
  const checkedByLabelX = MARGIN + 2.5;
  doc.text(checkedByLabel, checkedByLabelX, y + 6);

  const signatureAreaX =
    checkedByLabelX + doc.getTextWidth(checkedByLabel) + 7;
  const signatureAreaWidth = 54;
  const signatureAreaHeight = 11;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(record.checkedByName || "-", MARGIN + 2.5, y + 14);

  if (record.signatureDataUrl) {
    const signature = await loadImage(record.signatureDataUrl);
    if (signature) {
      const size = containImage(
        signature,
        signatureAreaWidth,
        signatureAreaHeight
      );
      doc.addImage(
        signature,
        "PNG",
        signatureAreaX,
        y + 1.5 + (signatureAreaHeight - size.height) / 2,
        size.width,
        size.height
      );
    }
  }
  doc.line(
    signatureAreaX,
    y + 14.5,
    signatureAreaX + signatureAreaWidth,
    y + 14.5
  );
  y += 20;
  drawField(doc, "ID No.:", record.checkedByIdNo, MARGIN, y, CONTENT_WIDTH, 10);

  drawFooter(doc);
  return doc;
}

export function uaMaintenancePdfFileName(record: UaMaintenanceRecord) {
  const model = safeFileName(record.uaModel || "UA");
  const uaId = safeFileName(record.uaId || "Maintenance");
  const date = record.inspectionDate || new Date().toISOString().slice(0, 10);
  return `${model} - ${uaId} - UA MAINTENANCE CHECK - ${date}.pdf`;
}
