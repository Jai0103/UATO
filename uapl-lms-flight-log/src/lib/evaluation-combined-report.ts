"use client";

import jsPDF from "jspdf";
import type { EvaluationReportingData, EvaluationSession } from "@/lib/evaluations";

export type EvaluationReportMeta = {
  title: string;
  scopeLabel: string;
  dateFrom: string;
  dateTo: string;
};

const MARGIN = 14;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = 182;
const PAGE_BOTTOM = 278;
let logo: HTMLImageElement | null = null;

function loadLogo() {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = "/UATO/aga-horizontal-logo.png";
  });
}

function safe(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").slice(0, 90) || "Evaluation";
}

function formatDate(value: string) {
  const parts = value.slice(0, 10).split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
}

function header(doc: jsPDF, meta: EvaluationReportMeta, continuation = false) {
  doc.setTextColor(16, 38, 61);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("APOLLO GLOBAL ACADEMY", MARGIN, 10);
  doc.setFontSize(16);
  doc.text(continuation ? `${meta.title} - CONTINUED` : meta.title, MARGIN, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90, 107, 128);
  doc.text(`${meta.scopeLabel}  |  ${formatDate(meta.dateFrom)} to ${formatDate(meta.dateTo)}`, MARGIN, 24);
  if (logo) {
    const ratio = logo.naturalWidth / Math.max(logo.naturalHeight, 1);
    const width = Math.min(43, ratio * 14);
    doc.addImage(logo, "PNG", PAGE_WIDTH - MARGIN - width, 6, width, width / ratio);
  }
  doc.setDrawColor(8, 102, 155);
  doc.setLineWidth(0.65);
  doc.line(MARGIN, 29, PAGE_WIDTH - MARGIN, 29);
  return 38;
}

function pageIfNeeded(doc: jsPDF, meta: EvaluationReportMeta, y: number, needed: number) {
  if (y + needed <= PAGE_BOTTOM) return y;
  doc.addPage();
  return header(doc, meta, true);
}

function metric(doc: jsPDF, x: number, y: number, width: number, label: string, value: string, color: [number, number, number]) {
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(218, 226, 235);
  doc.roundedRect(x, y, width, 20, 1.5, 1.5, "FD");
  doc.setFillColor(...color);
  doc.roundedRect(x, y, 2, 20, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(label.toUpperCase(), x + 5, y + 6);
  doc.setFontSize(13);
  doc.setTextColor(16, 38, 61);
  doc.text(value, x + 5, y + 15);
}

type Score = { label: string; average: number; ratings: number; responses: number };

function buildScores(data: EvaluationReportingData) {
  const questionMap = new Map(data.questions.map((question) => [question.id, question]));
  const sessionMap = new Map(data.sessions.map((session) => [session.id, session]));
  const responseMap = new Map(data.responses.map((response) => [response.id, response]));
  const aggregate = (labelFor: (session: EvaluationSession, section: string) => string) => {
    const values = new Map<string, { sum: number; ratings: number; responses: Set<string> }>();
    data.answers.forEach((answer) => {
      if (answer.rating <= 0) return;
      const response = responseMap.get(answer.responseId);
      const session = response ? sessionMap.get(response.sessionId) : undefined;
      const question = questionMap.get(answer.questionId);
      if (!session || !question) return;
      const label = labelFor(session, question.section);
      if (!label) return;
      const current = values.get(label) || { sum: 0, ratings: 0, responses: new Set<string>() };
      current.sum += answer.rating;
      current.ratings += 1;
      current.responses.add(answer.responseId);
      values.set(label, current);
    });
    return Array.from(values, ([label, value]) => ({
      label,
      average: value.ratings ? value.sum / value.ratings : 0,
      ratings: value.ratings,
      responses: value.responses.size
    })).sort((a, b) => b.average - a.average || a.label.localeCompare(b.label));
  };
  return {
    sections: aggregate((_session, section) => section),
    trainers: aggregate((session, section) => section === "Trainer / Instructor" ? session.trainerName || "Unassigned trainer" : ""),
    courses: aggregate((session, section) => section === "Overall Course Evaluation" || section === "Course Content & Learning" ? session.courseName : "")
  };
}

function scoreTable(doc: jsPDF, meta: EvaluationReportMeta, y: number, title: string, scores: Score[], accent: [number, number, number]) {
  y = pageIfNeeded(doc, meta, y, 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(16, 38, 61);
  doc.text(title, MARGIN, y);
  y += 6;
  if (!scores.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text("No rated responses for this section.", MARGIN, y);
    return y + 7;
  }
  scores.forEach((score, index) => {
    y = pageIfNeeded(doc, meta, y, 12);
    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(MARGIN, y - 4, CONTENT_WIDTH, 11, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    doc.setTextColor(42, 57, 77);
    const label = (doc.splitTextToSize(score.label, 83) as string[])[0] || score.label;
    doc.text(label, MARGIN + 2, y + 1);
    const barX = 106;
    const barWidth = 54;
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(barX, y - 2, barWidth, 3.5, 1.5, 1.5, "F");
    doc.setFillColor(...accent);
    doc.roundedRect(barX, y - 2, Math.max(1.5, barWidth * score.average / 5), 3.5, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(16, 38, 61);
    doc.text(`${score.average.toFixed(2)} / 5`, 193, y + 1, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(120, 134, 151);
    doc.text(`${score.responses} responses`, 193, y + 5, { align: "right" });
    y += 11;
  });
  return y + 4;
}

export async function downloadCombinedEvaluationPdf(meta: EvaluationReportMeta, data: EvaluationReportingData) {
  logo = await loadLogo();
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  let y = header(doc, meta);
  const scores = buildScores(data);
  const allRatings = data.answers.filter((answer) => answer.rating > 0);
  const average = allRatings.length ? allRatings.reduce((sum, answer) => sum + answer.rating, 0) / allRatings.length : 0;
  const recommendations = data.responses.filter((response) => response.recommendTraining);
  const recommendRate = recommendations.length
    ? 100 * recommendations.filter((response) => response.recommendTraining === "yes").length / recommendations.length
    : 0;
  const metricWidth = (CONTENT_WIDTH - 9) / 4;
  metric(doc, MARGIN, y, metricWidth, "Responses", String(data.responses.length), [8, 102, 255]);
  metric(doc, MARGIN + metricWidth + 3, y, metricWidth, "Average", allRatings.length ? `${average.toFixed(2)} / 5` : "-", [124, 58, 237]);
  metric(doc, MARGIN + (metricWidth + 3) * 2, y, metricWidth, "Recommend", recommendations.length ? `${recommendRate.toFixed(0)}%` : "-", [5, 150, 105]);
  metric(doc, MARGIN + (metricWidth + 3) * 3, y, metricWidth, "Sessions", String(data.sessions.length), [217, 119, 6]);
  y += 29;
  y = scoreTable(doc, meta, y, "Quality performance by section", scores.sections, [8, 102, 255]);
  y = scoreTable(doc, meta, y, "Trainer effectiveness", scores.trainers, [124, 58, 237]);
  y = scoreTable(doc, meta, y, "Course performance", scores.courses, [5, 150, 105]);

  const questionMap = new Map(data.questions.map((question) => [question.id, question]));
  const questionScores = new Map<string, { sum: number; count: number; label: string }>();
  data.answers.forEach((answer) => {
    if (answer.rating <= 0) return;
    const question = questionMap.get(answer.questionId);
    if (!question) return;
    const current = questionScores.get(answer.questionId) || { sum: 0, count: 0, label: question.text };
    current.sum += answer.rating;
    current.count += 1;
    questionScores.set(answer.questionId, current);
  });
  const questions = Array.from(questionScores.values()).map((item) => ({ label: item.label, average: item.sum / item.count, ratings: item.count, responses: item.count }));
  y = scoreTable(doc, meta, y, "Question-level results", questions, [217, 119, 6]);

  const comments = data.responses.flatMap((response) => [
    response.mostUseful ? { label: "Most useful", text: response.mostUseful } : null,
    response.improvements ? { label: "Improvement opportunity", text: response.improvements } : null,
    response.additionalComments ? { label: "Additional comment", text: response.additionalComments } : null
  ]).filter((item): item is { label: string; text: string } => Boolean(item));
  if (comments.length) {
    doc.addPage();
    y = header(doc, meta, true);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(16, 38, 61);
    doc.text("Anonymized learner feedback", MARGIN, y);
    y += 7;
    comments.forEach((comment, index) => {
      const lines = doc.splitTextToSize(comment.text, CONTENT_WIDTH - 8) as string[];
      y = pageIfNeeded(doc, meta, y, 10 + lines.length * 4);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(MARGIN, y - 4, CONTENT_WIDTH, 7 + lines.length * 4, 1.5, 1.5, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      doc.setTextColor(8, 102, 155);
      doc.text(`${comment.label.toUpperCase()} ${index + 1}`, MARGIN + 4, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(42, 57, 77);
      doc.text(lines, MARGIN + 4, y + 5, { lineHeightFactor: 1.15 });
      y += 11 + lines.length * 4;
    });
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(218, 226, 235);
    doc.line(MARGIN, 284, PAGE_WIDTH - MARGIN, 284);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.7);
    doc.setTextColor(100, 116, 139);
    doc.text("Apollo Global Academy | Confidential quality assurance report", MARGIN, 289);
    doc.text(`Page ${page} of ${pages}`, PAGE_WIDTH - MARGIN, 289, { align: "right" });
  }
  doc.save(`${safe(meta.title)} - ${meta.dateFrom} TO ${meta.dateTo}.pdf`);
}

function csv(value: unknown) {
  return `"${String(value ?? "").replace(/\r?\n/g, " ").replace(/"/g, '""')}"`;
}

export function downloadCombinedEvaluationCsv(meta: EvaluationReportMeta, data: EvaluationReportingData) {
  const sessions = new Map(data.sessions.map((session) => [session.id, session]));
  const questions = new Map(data.questions.map((question) => [question.id, question]));
  const rows: unknown[][] = [["Response ID", "Course", "Training Date", "Trainer", "Trainer Email", "Learner", "Organisation", "Question Section", "Question", "Rating", "Response", "Submitted At"]];
  const responseMap = new Map(data.responses.map((response) => [response.id, response]));
  data.answers.forEach((answer) => {
    const response = responseMap.get(answer.responseId);
    const session = response ? sessions.get(response.sessionId) : undefined;
    const question = questions.get(answer.questionId);
    if (!response || !session || !question) return;
    rows.push([response.id, session.courseName, session.trainingDate, session.trainerName, session.trainerEmail, response.studentName, response.company, question.section, question.text, answer.rating || "", answer.value, response.submittedAt]);
  });
  const url = URL.createObjectURL(new Blob([`\uFEFF${rows.map((row) => row.map(csv).join(",")).join("\r\n")}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safe(meta.title)} - ${meta.dateFrom} TO ${meta.dateTo}.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
