import jsPDF from "jspdf";
import {
  evaluationRatingFields,
  type EvaluationResponse,
  type EvaluationResponseSummary,
  type EvaluationSession,
} from "@/lib/evaluations";

const LOGO_PATH = "/UATO/aga-horizontal-logo.png";
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = 286;

const ratingLabels: Record<
  (typeof evaluationRatingFields)[number],
  string
> = {
  objectivesClear: "Training objectives and outcomes",
  materialsEffective: "Training materials",
  trainerKnowledge: "Trainer knowledge",
  theoryDelivery: "Theory lesson delivery",
  practicalInstruction: "Practical instruction",
  equipmentFacilities: "Equipment and facilities",
  safetyGuidance: "Safety guidance",
  overallSatisfaction: "Overall satisfaction",
};

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
    height: sourceHeight * scale,
  };
}

function safeFileName(value: string) {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 100) || "Training"
  );
}

function formatDate(value: string) {
  if (!value) return "-";
  const parts = value.slice(0, 10).split("-");
  return parts.length === 3
    ? `${parts[2]}/${parts[1]}/${parts[0]}`
    : value;
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-SG", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function reportDate() {
  return new Date().toISOString().slice(0, 10);
}

function drawHeader(
  doc: jsPDF,
  logo: HTMLImageElement | null,
  title: string,
  subtitle: string
) {
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("APOLLO GLOBAL ACADEMY", MARGIN, 10);
  doc.setFontSize(17);
  doc.text(title, MARGIN, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(subtitle, MARGIN, 23);

  if (logo) {
    const size = containImage(logo, 49, 16);
    doc.addImage(
      logo,
      "PNG",
      PAGE_WIDTH - MARGIN - size.width,
      6 + (16 - size.height) / 2,
      size.width,
      size.height
    );
  }

  doc.setDrawColor(14, 116, 144);
  doc.setLineWidth(0.6);
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
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(x, y, width, 15, 1.2, 1.2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text(label.toUpperCase(), x + 3, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  const lines = doc.splitTextToSize(value || "-", width - 6);
  doc.text(lines.slice(0, 2), x + 3, y + 10.5, {
    lineHeightFactor: 1,
  });
}

function drawMetric(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  accent: [number, number, number]
) {
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(x, y, width, 21, 1.5, 1.5, "FD");
  doc.setFillColor(...accent);
  doc.rect(x, y, 1.5, 21, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(label.toUpperCase(), x + 5, y + 6);
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(value, x + 5, y + 16);
}

function overallAverage(summary: EvaluationResponseSummary) {
  const values = evaluationRatingFields.map(
    (field) => Number(summary.averages[field]) || 0
  );
  if (!summary.responseCount) return 0;
  return (
    values.reduce((total, value) => total + value, 0) / values.length
  );
}

function drawRatings(
  doc: jsPDF,
  summary: EvaluationResponseSummary,
  startY: number
) {
  let y = startY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Rating Summary", MARGIN, y);
  y += 5;

  evaluationRatingFields.forEach((field, index) => {
    const score = Number(summary.averages[field]) || 0;
    const rowY = y + index * 14;
    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(MARGIN, rowY, CONTENT_WIDTH, 14, "F");
    }
    doc.setDrawColor(226, 232, 240);
    doc.line(MARGIN, rowY + 14, PAGE_WIDTH - MARGIN, rowY + 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.4);
    doc.setTextColor(30, 41, 59);
    doc.text(ratingLabels[field], MARGIN + 3, rowY + 8.5);

    const barX = 119;
    const barWidth = 55;
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(barX, rowY + 5.2, barWidth, 3.5, 1.5, 1.5, "F");
    if (score > 0) {
      doc.setFillColor(3, 105, 161);
      doc.roundedRect(
        barX,
        rowY + 5.2,
        Math.max(1.5, (barWidth * score) / 5),
        3.5,
        1.5,
        1.5,
        "F"
      );
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(`${score.toFixed(1)} / 5`, PAGE_WIDTH - MARGIN - 2, rowY + 8.5, {
      align: "right",
    });
  });

  return y + evaluationRatingFields.length * 14;
}

function ensureCommentSpace(
  doc: jsPDF,
  logo: HTMLImageElement | null,
  y: number,
  requiredHeight: number,
  session: EvaluationSession
) {
  if (y + requiredHeight <= FOOTER_Y - 7) return y;
  doc.addPage("a4", "portrait");
  drawHeader(
    doc,
    logo,
    "STUDENT EVALUATION REPORT",
    `${session.courseName} · Written Feedback`
  );
  return 36;
}

function drawCommentResponse(
  doc: jsPDF,
  logo: HTMLImageElement | null,
  session: EvaluationSession,
  response: EvaluationResponse,
  index: number,
  startY: number
) {
  const identity = response.studentName || "Anonymous student";
  const organisation = response.company || "Organisation not provided";
  const commentSections = [
    { label: "Most useful", value: response.mostUseful },
    { label: "Suggested improvements", value: response.improvements },
    { label: "Additional comments", value: response.additionalComments },
  ].filter((section) => section.value);
  let y = ensureCommentSpace(doc, logo, startY, 24, session);

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 15, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`${index}. ${identity}`, MARGIN + 4, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${organisation} · ${formatDateTime(response.submittedAt)}`,
    MARGIN + 4,
    y + 11
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.setTextColor(3, 105, 161);
  doc.text(
    `Recommend: ${
      response.recommendTraining === "yes" ? "Yes" : "No"
    }`,
    PAGE_WIDTH - MARGIN - 4,
    y + 8.5,
    { align: "right" }
  );

  y += 18;

  commentSections.forEach((section) => {
    let remaining = doc.splitTextToSize(
      section.value,
      CONTENT_WIDTH - 10
    ) as string[];
    let continuation = false;

    while (remaining.length) {
      y = ensureCommentSpace(doc, logo, y, 17, session);
      const availableHeight = FOOTER_Y - 8 - y;
      const maximumLines = Math.max(
        1,
        Math.floor((availableHeight - 10) / 3.7)
      );
      const lines = remaining.slice(0, maximumLines);
      remaining = remaining.slice(maximumLines);
      const sectionHeight = 9 + lines.length * 3.7;

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(
        MARGIN,
        y,
        CONTENT_WIDTH,
        sectionHeight,
        1.2,
        1.2,
        "FD"
      );
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.2);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `${section.label.toUpperCase()}${
          continuation ? " (CONTINUED)" : ""
        }`,
        MARGIN + 4,
        y + 4.5
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.text(lines, MARGIN + 4, y + 9, {
        lineHeightFactor: 1.1,
      });

      y += sectionHeight + 3;
      continuation = true;
    }
  });

  return y + 2;
}

function drawFooters(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(203, 213, 225);
    doc.line(MARGIN, FOOTER_Y, PAGE_WIDTH - MARGIN, FOOTER_Y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.7);
    doc.setTextColor(100, 116, 139);
    doc.text(
      "Apollo Global Academy · Confidential quality assurance record",
      MARGIN,
      291
    );
    doc.text(`Page ${page} of ${pages}`, PAGE_WIDTH - MARGIN, 291, {
      align: "right",
    });
  }
}

export async function downloadEvaluationPdf(
  session: EvaluationSession,
  responses: EvaluationResponse[],
  summary: EvaluationResponseSummary
) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const logo = await loadImage(LOGO_PATH);

  drawHeader(
    doc,
    logo,
    "STUDENT EVALUATION REPORT",
    "Training Quality and Feedback Summary"
  );

  const gap = 3;
  const fieldWidth = (CONTENT_WIDTH - gap) / 2;
  drawField(doc, "Course / programme", session.courseName, MARGIN, 34, fieldWidth);
  drawField(
    doc,
    "Trainer",
    session.trainerName,
    MARGIN + fieldWidth + gap,
    34,
    fieldWidth
  );
  drawField(
    doc,
    "Training date",
    formatDate(session.trainingDate),
    MARGIN,
    52,
    fieldWidth
  );
  drawField(
    doc,
    "Location",
    session.location,
    MARGIN + fieldWidth + gap,
    52,
    fieldWidth
  );

  const metricGap = 3;
  const metricWidth = (CONTENT_WIDTH - metricGap * 2) / 3;
  drawMetric(
    doc,
    "Responses",
    String(summary.responseCount),
    MARGIN,
    72,
    metricWidth,
    [14, 165, 233]
  );
  drawMetric(
    doc,
    "Overall average",
    `${overallAverage(summary).toFixed(1)} / 5`,
    MARGIN + metricWidth + metricGap,
    72,
    metricWidth,
    [139, 92, 246]
  );
  drawMetric(
    doc,
    "Would recommend",
    `${summary.recommendPercentage}%`,
    MARGIN + (metricWidth + metricGap) * 2,
    72,
    metricWidth,
    [16, 185, 129]
  );

  const ratingsEndY = drawRatings(doc, summary, 103);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.3);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Generated ${formatDateTime(new Date().toISOString())}. Scores are averages from submitted responses.`,
    MARGIN,
    ratingsEndY + 7
  );

  const comments = responses.filter(
    (response) =>
      response.mostUseful ||
      response.improvements ||
      response.additionalComments
  );

  if (comments.length) {
    doc.addPage("a4", "portrait");
    drawHeader(
      doc,
      logo,
      "STUDENT EVALUATION REPORT",
      `${session.courseName} · Written Feedback`
    );
    let y = 36;
    comments.forEach((response, index) => {
      y = drawCommentResponse(
        doc,
        logo,
        session,
        response,
        index + 1,
        y
      );
    });
  }

  drawFooters(doc);
  doc.save(
    `${safeFileName(session.courseName)} - EVALUATION REPORT - ${reportDate()}.pdf`
  );
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadEvaluationCsv(
  session: EvaluationSession,
  responses: EvaluationResponse[]
) {
  const headers = [
    "Response ID",
    "Course / Programme",
    "Trainer",
    "Training Date",
    "Location",
    "Student Name",
    "Company / Organisation",
    ...evaluationRatingFields.map((field) => ratingLabels[field]),
    "Would Recommend",
    "Most Useful",
    "Suggested Improvements",
    "Additional Comments",
    "Submitted At",
  ];

  const rows = responses.map((response) => [
    response.id,
    session.courseName,
    session.trainerName,
    session.trainingDate,
    session.location,
    response.studentName || "Anonymous",
    response.company,
    ...evaluationRatingFields.map((field) => response[field]),
    response.recommendTraining,
    response.mostUseful,
    response.improvements,
    response.additionalComments,
    response.submittedAt,
  ]);

  const csv = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFileName(
    session.courseName
  )} - EVALUATION RESPONSES - ${reportDate()}.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
