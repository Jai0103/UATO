"use client";

import jsPDF from "jspdf";
import type { EvaluationAnswer, EvaluationQuestion } from "@/lib/evaluation-firebase-api";
import type { EvaluationResponse, EvaluationSession } from "@/lib/evaluations";
import { isQuestionApplicable, isStandardEvaluation } from "@/lib/evaluation-standard-questions";

export type EvaluationReportData = {
  responses: EvaluationResponse[];
  questions: EvaluationQuestion[];
  answers: EvaluationAnswer[];
};

const MARGIN = 15;
const WIDTH = 180;
const BOTTOM = 276;
let reportLogo: HTMLImageElement | null = null;

function loadLogo() {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = "/UATO/aga-horizontal-logo.png";
  });
}

function safeFileName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").slice(0, 80) || "Training";
}

function responseText(answer: EvaluationAnswer | undefined, question: EvaluationQuestion) {
  if (!answer) return "Not answered";
  if (question.responseType === "rating") return answer.rating ? `${answer.rating} / ${question.scaleMax}` : "Not answered";
  if (question.responseType === "yesNo") return answer.value === "yes" ? "Yes" : answer.value === "no" ? "No" : "Not answered";
  return answer.value || "Not answered";
}

function summaryForQuestion(question: EvaluationQuestion, answers: EvaluationAnswer[]) {
  const values = answers.filter((answer) => answer.questionId === question.id);
  if (question.responseType === "rating") {
    const ratings = values.map((answer) => answer.rating).filter((rating) => rating > 0);
    const average = ratings.length ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length : 0;
    return ratings.length ? `${average.toFixed(2)} / ${question.scaleMax}  (${ratings.length} ratings)` : "No ratings";
  }
  if (question.responseType === "yesNo" || question.responseType === "multipleChoice") {
    const counts = new Map<string, number>();
    values.forEach((answer) => {
      if (answer.value) counts.set(answer.value, (counts.get(answer.value) || 0) + 1);
    });
    return Array.from(counts, ([value, count]) => `${value}: ${count}`).join("   |   ") || "No responses";
  }
  const count = values.filter((answer) => answer.value.trim()).length;
  return `${count} written response${count === 1 ? "" : "s"}`;
}

function addWrapped(doc: jsPDF, text: string, x: number, y: number, width: number, lineHeight = 5) {
  const lines = doc.splitTextToSize(text, width) as string[];
  doc.text(lines, x, y, { lineHeightFactor: 1.25 });
  return y + Math.max(1, lines.length) * lineHeight;
}

function heading(doc: jsPDF, session: EvaluationSession, title: string) {
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("APOLLO GLOBAL ACADEMY", MARGIN, 13);
  doc.setFontSize(16);
  doc.text(title, MARGIN, 22);
  if (reportLogo) {
    const ratio = reportLogo.naturalWidth / Math.max(1, reportLogo.naturalHeight);
    const width = Math.min(37, ratio * 14);
    const height = width / ratio;
    doc.addImage(reportLogo, "PNG", 195 - width, 8, width, height);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  const subtitle = `${session.courseName}  |  ${session.trainingDate}  |  ${session.trainerName}`;
  doc.text((doc.splitTextToSize(subtitle, WIDTH) as string[])[0] || "", MARGIN, 29);
  doc.setDrawColor(14, 116, 144);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, 33, 195, 33);
  return 42;
}

function nextPageIfNeeded(doc: jsPDF, session: EvaluationSession, y: number, needed: number) {
  if (y + needed <= BOTTOM) return y;
  doc.addPage();
  return heading(doc, session, "STUDENT EVALUATION REPORT");
}

export async function downloadDynamicEvaluationPdf(session: EvaluationSession, data: EvaluationReportData) {
  reportLogo = await loadLogo();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  let y = heading(doc, session, "STUDENT EVALUATION REPORT");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`${data.responses.length} learner responses`, MARGIN, y);
  y += 7;
  const standard = isStandardEvaluation(data.questions);
  const recommendations = data.responses.filter((response) => response.recommendTraining);
  const recommendYes = recommendations.filter((response) => response.recommendTraining === "yes").length;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Would recommend: ${recommendations.length ? `${Math.round(100 * recommendYes / recommendations.length)}% (${recommendYes}/${recommendations.length})` : "No responses"}`, MARGIN, y);
  y += 8;
  if (standard) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Section averages", MARGIN, y);
    y += 6;
    const sections = Array.from(new Set(data.questions.map((question) => question.section)));
    sections.forEach((section) => {
      const ids = new Set(data.questions.filter((question) => question.section === section && question.responseType === "rating").map((question) => question.id));
      const ratings = data.answers.filter((answer) => ids.has(answer.questionId) && answer.rating > 0);
      y = nextPageIfNeeded(doc, session, y, 7);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text(section, MARGIN + 2, y);
      doc.setFont("helvetica", "bold");
      doc.text(ratings.length ? `${(ratings.reduce((sum, answer) => sum + answer.rating, 0) / ratings.length).toFixed(2)} / 5  (${ratings.length} ratings)` : "No ratings", 193, y, { align: "right" });
      y += 6;
    });
    y += 4;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Question summary", MARGIN, y);
  y += 7;

  data.questions.forEach((question, index) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const questionLines = doc.splitTextToSize(`${index + 1}. ${question.text}`, WIDTH - 6) as string[];
    const summary = summaryForQuestion(question, data.answers);
    const summaryLines = doc.splitTextToSize(summary, WIDTH - 6) as string[];
    y = nextPageIfNeeded(doc, session, y, questionLines.length * 5 + summaryLines.length * 5 + 8);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    const height = questionLines.length * 5 + summaryLines.length * 5 + 7;
    doc.roundedRect(MARGIN, y - 4, WIDTH, height, 1.5, 1.5, "FD");
    doc.setTextColor(15, 23, 42);
    y = addWrapped(doc, `${index + 1}. ${question.text}`, MARGIN + 3, y, WIDTH - 6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    y = addWrapped(doc, summary, MARGIN + 3, y + 1, WIDTH - 6) + 5;
  });

  if (data.responses.length) {
    doc.addPage();
    y = heading(doc, session, "INDIVIDUAL RESPONSES");
    const answerMap = new Map(data.answers.map((answer) => [`${answer.responseId}__${answer.questionId}`, answer]));
    data.responses.forEach((response, responseIndex) => {
      y = nextPageIfNeeded(doc, session, y, 22);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      y = addWrapped(doc, `${responseIndex + 1}. ${response.studentName || "Anonymous learner"}  |  ${response.company || "Organisation not specified"}`, MARGIN, y, WIDTH) + 2;
      doc.setFontSize(8);
      data.questions.forEach((question) => {
        const answer = answerMap.get(`${response.id}__${question.id}`);
        const value = !answer && standard && !isQuestionApplicable(question, response.trainingComponent || "", response.theoryDeliveryMode || "")
          ? "Not applicable" : responseText(answer, question);
        const lines = doc.splitTextToSize(`${question.text}: ${value}`, WIDTH - 4) as string[];
        y = nextPageIfNeeded(doc, session, y, lines.length * 4.5 + 3);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(51, 65, 85);
        y = addWrapped(doc, `${question.text}: ${value}`, MARGIN + 2, y, WIDTH - 4, 4.5) + 2;
      });
      const comments = [
        ["Training component", response.trainingComponent || "Not recorded"],
        ["Theory delivery", response.theoryDeliveryMode || "Not applicable"],
        ["Would recommend", response.recommendTraining === "yes" ? "Yes" : response.recommendTraining === "no" ? "No" : "Not recorded"],
        ["Most useful", response.mostUseful],
        ["Improvements", response.improvements],
        ["Additional comments", response.additionalComments]
      ].filter((item) => item[1]);
      comments.forEach(([label, value]) => {
        const lines = doc.splitTextToSize(`${label}: ${value}`, WIDTH - 4) as string[];
        y = nextPageIfNeeded(doc, session, y, lines.length * 4.5 + 3);
        y = addWrapped(doc, `${label}: ${value}`, MARGIN + 2, y, WIDTH - 4, 4.5) + 2;
      });
      y += 6;
    });
  }

  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`AGA | Student Evaluation  -  Page ${page} of ${count}`, MARGIN, 288);
  }
  doc.save(`${safeFileName(session.courseName)} - EVALUATION REPORT - ${session.trainingDate}.pdf`);
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadDynamicEvaluationCsv(session: EvaluationSession, data: EvaluationReportData) {
  const answerMap = new Map(data.answers.map((answer) => [`${answer.responseId}__${answer.questionId}`, answer]));
  const headers = ["Response ID", "Course", "Training Date", "Trainer", "Student Name", "Organisation", "Training Component", "Theory Delivery", ...data.questions.map((question) => question.text), "Would Recommend", "Most Useful", "Improvements", "Additional Comments", "Submitted At"];
  const rows = data.responses.map((response) => [
    response.id, session.courseName, session.trainingDate, session.trainerName,
    response.studentName || "Anonymous", response.company, response.trainingComponent || "", response.theoryDeliveryMode || "",
    ...data.questions.map((question) => {
      const answer = answerMap.get(`${response.id}__${question.id}`);
      return !answer && isStandardEvaluation(data.questions) && !isQuestionApplicable(question, response.trainingComponent || "", response.theoryDeliveryMode || "")
        ? "Not applicable" : responseText(answer, question);
    }),
    response.recommendTraining, response.mostUseful, response.improvements,
    response.additionalComments, response.submittedAt
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFileName(session.courseName)} - EVALUATION RESPONSES - ${session.trainingDate}.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
