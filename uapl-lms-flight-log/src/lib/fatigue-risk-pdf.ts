import jsPDF from "jspdf";
import {
  FATIGUE_RISK_QUESTIONS,
  FATIGUE_RISK_SECTIONS,
  type FatigueRiskRecord,
  type FatigueResponseValue
} from "@/lib/fatigue-risk";

const LOGO_PATH = "/UATO/apollo-global-academy-logo.png";
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 12;
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

function safeFileName(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ");
}

function formatDate(value: string) {
  const parts = value.split("-");
  return parts.length === 3
    ? `${parts[2]}/${parts[1]}/${parts[0]}`
    : value;
}

function drawHeader(doc: jsPDF, logo: HTMLImageElement | null) {
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("ADA-UATO-2G", MARGIN, 11);
  doc.setFontSize(15);
  doc.text("FATIGUE RISK IDENTIFICATION", MARGIN, 18);
  doc.text("CHECKLIST", MARGIN, 24);

  if (logo) {
    const size = containImage(logo, 48, 16);
    doc.addImage(
      logo,
      "PNG",
      PAGE_WIDTH - MARGIN - size.width,
      7 + (16 - size.height) / 2,
      size.width,
      size.height
    );
  }

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, 28, PAGE_WIDTH - MARGIN, 28);
}

function drawField(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number
) {
  doc.setDrawColor(71, 85, 105);
  doc.setLineWidth(0.25);
  doc.rect(x, y, width, 10);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(label, x + 2.5, y + 6.2);
  const labelWidth = doc.getTextWidth(label) + 5;
  doc.setFont("helvetica", "normal");
  doc.text(value || "-", x + labelWidth, y + 6.2, {
    maxWidth: width - labelWidth - 2
  });
}

function drawResponse(
  doc: jsPDF,
  response: FatigueResponseValue,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const centerY = y + height / 2;
  const yesX = x + width * 0.27;
  const noX = x + width * 0.67;

  [
    { value: "yes", label: "Yes", x: yesX },
    { value: "no", label: "No", x: noX }
  ].forEach((option) => {
    const selected = response === option.value;
    doc.setDrawColor(selected ? 3 : 100, selected ? 105 : 116, selected ? 161 : 139);
    doc.setFillColor(3, 105, 161);
    doc.circle(option.x, centerY, 1.7, selected ? "FD" : "S");
    doc.setFont("helvetica", selected ? "bold" : "normal");
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(option.label, option.x + 3, centerY + 1);
  });
}

function drawSection(
  doc: jsPDF,
  label: string,
  y: number
) {
  doc.setFillColor(226, 232, 240);
  doc.setDrawColor(71, 85, 105);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 8, "FD");
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(label, MARGIN + 2.5, y + 5.3);
  return y + 8;
}

function questionHeight(doc: jsPDF, question: string) {
  const lines = doc.splitTextToSize(question, CONTENT_WIDTH - 34);
  return Math.max(11, lines.length * 3.5 + 4);
}

function drawQuestion(
  doc: jsPDF,
  question: string,
  response: FatigueResponseValue,
  y: number,
  alternate: boolean
) {
  const responseWidth = 31;
  const questionWidth = CONTENT_WIDTH - responseWidth;
  const height = questionHeight(doc, question);

  if (alternate) {
    doc.setFillColor(248, 250, 252);
    doc.rect(MARGIN, y, CONTENT_WIDTH, height, "F");
  }

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.2);
  doc.rect(MARGIN, y, questionWidth, height);
  doc.rect(MARGIN + questionWidth, y, responseWidth, height);

  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  const lines = doc.splitTextToSize(question, questionWidth - 5);
  doc.text(lines, MARGIN + 2.5, y + 4.5, {
    lineHeightFactor: 1.05,
    maxWidth: questionWidth - 5
  });
  drawResponse(
    doc,
    response,
    MARGIN + questionWidth,
    y,
    responseWidth,
    height
  );

  return y + height;
}

function drawFooter(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(203, 213, 225);
    doc.line(MARGIN, 286, PAGE_WIDTH - MARGIN, 286);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.7);
    doc.setTextColor(100, 116, 139);
    doc.text(COPYRIGHT, MARGIN, 291);
    doc.text(`Page ${page} of ${pages}`, PAGE_WIDTH - MARGIN, 291, {
      align: "right"
    });
  }
}

async function drawEvaluation(
  doc: jsPDF,
  record: FatigueRiskRecord,
  signature: HTMLImageElement | null,
  y: number
) {
  if (y > 218) {
    doc.addPage("a4", "portrait");
    y = 34;
  }

  doc.setFillColor(226, 232, 240);
  doc.setDrawColor(71, 85, 105);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 8, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text("Recommendation by Head of Training", MARGIN + 2.5, y + 5.3);
  y += 8;

  doc.setDrawColor(71, 85, 105);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const recommendation = doc.splitTextToSize(
    record.recommendation || "",
    CONTENT_WIDTH - 5
  );
  doc.text(recommendation, MARGIN + 2.5, y + 5, {
    maxWidth: CONTENT_WIDTH - 5
  });
  y += 34;

  const leftWidth = 94;
  drawField(doc, "Evaluated By:", record.evaluatedBy, MARGIN, y, leftWidth);
  drawField(
    doc,
    "Position:",
    record.evaluatorPosition,
    MARGIN,
    y + 10,
    leftWidth
  );

  doc.setDrawColor(71, 85, 105);
  doc.rect(MARGIN + leftWidth, y, CONTENT_WIDTH - leftWidth, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("Signature:", MARGIN + leftWidth + 2.5, y + 6);
  if (signature) {
    const size = containImage(signature, 55, 13);
    doc.addImage(
      signature,
      "PNG",
      MARGIN + leftWidth + 28,
      y + 2 + (13 - size.height) / 2,
      size.width,
      size.height
    );
  }
}

export async function createFatigueRiskPdf(record: FatigueRiskRecord) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });
  const [logo, signature] = await Promise.all([
    loadImage(LOGO_PATH),
    record.signatureDataUrl
      ? loadImage(record.signatureDataUrl)
      : Promise.resolve(null)
  ]);
  const responseMap = new Map(
    record.responses.map((response) => [
      response.questionId,
      response.response
    ])
  );

  drawHeader(doc, logo);
  drawField(
    doc,
    "Instructor / AFE Name:",
    record.instructorName,
    MARGIN,
    33,
    132
  );
  drawField(
    doc,
    "Date:",
    formatDate(record.assessmentDate),
    MARGIN + 132,
    33,
    CONTENT_WIDTH - 132
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    "Please select Yes or No for each item. A Yes response identifies a potential fatigue risk.",
    MARGIN,
    48
  );

  let y = 53;
  let rowIndex = 0;
  FATIGUE_RISK_SECTIONS.forEach((section) => {
    const questions = FATIGUE_RISK_QUESTIONS.filter(
      (question) => question.sectionId === section.id
    );
    const requiredHeight =
      8 +
      questions.reduce(
        (total, question) => total + questionHeight(doc, question.question),
        0
      );

    if (y + requiredHeight > 276) {
      doc.addPage("a4", "portrait");
      drawHeader(doc, logo);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(
        `${record.instructorName || "-"} / ${formatDate(record.assessmentDate)} - CONTINUED`,
        MARGIN,
        34
      );
      y = 40;
    }

    y = drawSection(doc, section.label, y);
    questions.forEach((question) => {
      y = drawQuestion(
        doc,
        question.question,
        responseMap.get(question.id) || "",
        y,
        rowIndex % 2 === 1
      );
      rowIndex += 1;
    });
  });

  await drawEvaluation(doc, record, signature, y + 5);
  drawFooter(doc);
  return doc;
}

export function fatigueRiskPdfFileName(record: FatigueRiskRecord) {
  const name = safeFileName(record.instructorName || "Trainer");
  const date = record.assessmentDate || new Date().toISOString().slice(0, 10);
  return `${name} - FATIGUE RISK CHECKLIST - ${date}.pdf`;
}

