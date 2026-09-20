"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  Timestamp,
  where,
  writeBatch,
  type DocumentData
} from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase-client";
import { addFirebaseAuditToBatch } from "@/lib/firebase-audit";
import {
  createFatigueResponses,
  currentWeekMonday,
  FATIGUE_RISK_QUESTIONS,
  type FatigueRiskRecord,
  type FatigueRiskRecordSummary,
  type FatigueRiskResponse
} from "@/lib/fatigue-risk";

export type FatigueRiskRecordsPage = {
  records: FatigueRiskRecordSummary[];
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export type FatigueRiskWeeklyStatus = {
  assessmentDate: string;
  today: string;
  completedCount: number;
  completedTrainerNames: string[];
  latestCompletedAt: string;
  latestEvaluator: string;
};

type FirebaseActor = {
  uid: string;
  name: string;
  email: string;
  role: "admin";
};

function text(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return String(value ?? "").trim();
}

function safeId(value: unknown) {
  return text(value).replace(/\//g, "_");
}

function responseDocumentId(recordId: string, questionId: string) {
  return `${safeId(recordId)}__${safeId(questionId)}`;
}

function summaryFromDoc(id: string, data: DocumentData): FatigueRiskRecordSummary {
  return {
    id,
    assessmentDate: text(data.assessmentDate),
    instructorName: text(data.instructorName),
    instructorEmail: text(data.instructorEmail).toLowerCase(),
    recommendation: text(data.recommendation),
    evaluatedBy: text(data.evaluatedBy),
    evaluatorPosition: text(data.evaluatorPosition) || "Head of Training",
    status: data.status === "submitted" ? "submitted" : "reviewed",
    createdAt: text(data.createdAt),
    updatedAt: text(data.updatedAt),
    riskCount: Number(data.riskCount) || 0,
    answeredCount: Number(data.answeredCount) || 0,
    totalQuestions: Number(data.totalQuestions) || FATIGUE_RISK_QUESTIONS.length,
    signatureCaptured: data.signatureCaptured === true
  };
}

function responseFromDoc(data: DocumentData): FatigueRiskResponse {
  const response = data.response === "yes" || data.response === "no" ? data.response : "";
  return { questionId: text(data.questionId), response };
}

async function requireAdmin(): Promise<FirebaseActor> {
  await firebaseAuth.authStateReady();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Your Firebase session has expired. Please sign in again.");
  const profile = await getDoc(doc(firestore, "users", user.uid));
  if (!profile.exists() || profile.data().status !== "active" || profile.data().role !== "admin") {
    throw new Error("Administrator access is required.");
  }
  return {
    uid: user.uid,
    name: text(profile.data().name || user.displayName || user.email || "Administrator"),
    email: text(profile.data().email || user.email).toLowerCase(),
    role: "admin"
  };
}

async function loadSummaries() {
  await requireAdmin();
  const snapshot = await getDocs(collection(firestore, "fatigueRiskRecords"));
  return snapshot.docs
    .map((item) => summaryFromDoc(item.id, item.data()))
    .sort((first, second) =>
      second.assessmentDate.localeCompare(first.assessmentDate) ||
      second.updatedAt.localeCompare(first.updatedAt)
    );
}

async function loadResponses(recordId: string) {
  const snapshot = await getDocs(query(
    collection(firestore, "fatigueRiskResponses"),
    where("recordId", "==", recordId)
  ));
  return createFatigueResponses(snapshot.docs.map((item) => responseFromDoc(item.data())));
}

async function loadSignature(recordId: string) {
  const snapshot = await getDoc(doc(firestore, "fatigueRiskSignatures", safeId(recordId)));
  return snapshot.exists() ? text(snapshot.data().signatureDataUrl) : "";
}

async function detailFromSummary(summary: FatigueRiskRecordSummary) {
  const [responses, signatureDataUrl] = await Promise.all([
    loadResponses(summary.id),
    loadSignature(summary.id)
  ]);
  return {
    id: summary.id,
    assessmentDate: summary.assessmentDate,
    instructorName: summary.instructorName,
    instructorEmail: summary.instructorEmail,
    responses,
    recommendation: summary.recommendation,
    evaluatedBy: summary.evaluatedBy,
    evaluatorPosition: summary.evaluatorPosition,
    signatureDataUrl,
    status: summary.status,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt
  } satisfies FatigueRiskRecord;
}

function auditValue(record: FatigueRiskRecord) {
  return {
    id: record.id,
    assessmentDate: record.assessmentDate,
    instructorName: record.instructorName,
    instructorEmail: record.instructorEmail,
    responses: record.responses,
    recommendation: record.recommendation,
    evaluatedBy: record.evaluatedBy,
    evaluatorPosition: record.evaluatorPosition,
    status: record.status,
    signatureCaptured: Boolean(record.signatureDataUrl),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function normalizedRecord(record: FatigueRiskRecord, id: string, createdAt: string) {
  const now = new Date().toISOString();
  return {
    ...record,
    id,
    assessmentDate: text(record.assessmentDate),
    instructorName: text(record.instructorName),
    instructorEmail: text(record.instructorEmail).toLowerCase(),
    responses: createFatigueResponses(record.responses || []),
    recommendation: text(record.recommendation),
    evaluatedBy: text(record.evaluatedBy),
    evaluatorPosition: text(record.evaluatorPosition) || "Head of Training",
    signatureDataUrl: text(record.signatureDataUrl),
    status: record.status === "submitted" ? "submitted" : "reviewed",
    createdAt: createdAt || now,
    updatedAt: now
  } satisfies FatigueRiskRecord;
}

function validateRecord(record: FatigueRiskRecord) {
  if (!record.assessmentDate) throw new Error("The Monday assessment date is required.");
  if (!record.instructorName) throw new Error("The trainer or AFE name is required.");
  if (record.responses.some((item) => item.response !== "yes" && item.response !== "no")) {
    throw new Error("Complete every Fatigue Risk checklist item before saving.");
  }
  if (!record.recommendation) throw new Error("The recommendation is required.");
  if (!record.evaluatedBy) throw new Error("The evaluator name is required.");
  if (!record.signatureDataUrl) throw new Error("The evaluator signature is required.");
}

export async function fetchFatigueRiskRecordsPage(request: {
  page?: number;
  pageSize?: number;
  query?: string;
  year?: string;
  month?: string;
} = {}) {
  const queryText = text(request.query).toLowerCase();
  const year = text(request.year);
  const month = text(request.month).padStart(request.month ? 2 : 0, "0");
  const filtered = (await loadSummaries()).filter((record) => {
    if (year && !record.assessmentDate.startsWith(`${year}-`)) return false;
    if (month && record.assessmentDate.slice(5, 7) !== month) return false;
    if (!queryText) return true;
    return `${record.instructorName} ${record.instructorEmail} ${record.evaluatedBy} ${record.recommendation}`
      .toLowerCase().includes(queryText);
  });
  const pageSize = Math.max(1, Math.min(Number(request.pageSize) || 10, 100));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.max(1, Math.min(Number(request.page) || 1, totalPages));
  return {
    records: filtered.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    totalRecords: filtered.length,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages
  } satisfies FatigueRiskRecordsPage;
}

export async function fetchFatigueRiskRecord(recordId: string) {
  await requireAdmin();
  const snapshot = await getDoc(doc(firestore, "fatigueRiskRecords", safeId(recordId)));
  if (!snapshot.exists()) throw new Error("The Fatigue Risk checklist was not found.");
  return detailFromSummary(summaryFromDoc(snapshot.id, snapshot.data()));
}

export async function fetchFatigueRiskWeeklyStatus() {
  const assessmentDate = currentWeekMonday();
  const records = (await loadSummaries()).filter((record) => record.assessmentDate === assessmentDate);
  const latest = [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return {
    assessmentDate,
    today: new Date().toISOString().slice(0, 10),
    completedCount: records.length,
    completedTrainerNames: Array.from(new Set(records.map((record) => record.instructorName).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    latestCompletedAt: latest?.updatedAt || "",
    latestEvaluator: latest?.evaluatedBy || ""
  } satisfies FatigueRiskWeeklyStatus;
}

export async function saveFatigueRiskRecord(input: FatigueRiskRecord) {
  const actor = await requireAdmin();
  const id = safeId(input.id || crypto.randomUUID());
  const reference = doc(firestore, "fatigueRiskRecords", id);
  const existingSnapshot = await getDoc(reference);
  const previous = existingSnapshot.exists()
    ? await detailFromSummary(summaryFromDoc(existingSnapshot.id, existingSnapshot.data()))
    : null;
  const record = normalizedRecord(input, id, previous?.createdAt || "");
  validateRecord(record);

  const duplicate = (await loadSummaries()).find((item) =>
    item.id !== id && item.assessmentDate === record.assessmentDate &&
    ((record.instructorEmail && item.instructorEmail === record.instructorEmail) ||
      item.instructorName.toLowerCase() === record.instructorName.toLowerCase())
  );
  if (duplicate) {
    throw new Error(`${record.instructorName} already has a checklist for ${record.assessmentDate}. Open that record and edit it instead.`);
  }

  const existingResponses = await getDocs(query(
    collection(firestore, "fatigueRiskResponses"),
    where("recordId", "==", id)
  ));
  const currentResponseIds = new Set(record.responses.map((item) => responseDocumentId(id, item.questionId)));
  const answeredCount = record.responses.filter((item) => Boolean(item.response)).length;
  const riskCount = record.responses.filter((item) => item.response === "yes").length;
  const batch = writeBatch(firestore);

  batch.set(reference, {
    id,
    assessmentDate: record.assessmentDate,
    instructorName: record.instructorName,
    instructorNameLower: record.instructorName.toLowerCase(),
    instructorEmail: record.instructorEmail,
    recommendation: record.recommendation,
    evaluatedBy: record.evaluatedBy,
    evaluatorPosition: record.evaluatorPosition,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    riskCount,
    answeredCount,
    totalQuestions: record.responses.length,
    signatureCaptured: true,
    schemaVersion: 2
  });
  record.responses.forEach((response) => {
    batch.set(doc(firestore, "fatigueRiskResponses", responseDocumentId(id, response.questionId)), {
      recordId: id,
      questionId: response.questionId,
      response: response.response,
      updatedAt: record.updatedAt,
      schemaVersion: 2
    });
  });
  existingResponses.docs.forEach((item) => {
    if (!currentResponseIds.has(item.id)) batch.delete(item.ref);
  });
  batch.set(doc(firestore, "fatigueRiskSignatures", id), {
    recordId: id,
    signatureDataUrl: record.signatureDataUrl,
    updatedAt: record.updatedAt,
    schemaVersion: 2
  });
  addFirebaseAuditToBatch(batch, {
    actorUserId: actor.uid,
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: previous ? "FATIGUE_RISK_UPDATED" : "FATIGUE_RISK_CREATED",
    entityType: "fatigueRisk",
    entityId: id,
    entityName: `${record.instructorName} - ${record.assessmentDate}`,
    previousValue: previous ? auditValue(previous) : null,
    updatedValue: auditValue(record),
    details: { assessmentDate: record.assessmentDate, riskCount }
  });
  await batch.commit();
  return record;
}

export async function deleteFatigueRiskRecord(recordId: string) {
  const actor = await requireAdmin();
  const record = await fetchFatigueRiskRecord(recordId);
  const responses = await getDocs(query(
    collection(firestore, "fatigueRiskResponses"),
    where("recordId", "==", record.id)
  ));
  const batch = writeBatch(firestore);
  batch.delete(doc(firestore, "fatigueRiskRecords", safeId(record.id)));
  responses.docs.forEach((item) => batch.delete(item.ref));
  batch.delete(doc(firestore, "fatigueRiskSignatures", safeId(record.id)));
  addFirebaseAuditToBatch(batch, {
    actorUserId: actor.uid,
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "FATIGUE_RISK_DELETED",
    entityType: "fatigueRisk",
    entityId: record.id,
    entityName: `${record.instructorName} - ${record.assessmentDate}`,
    previousValue: auditValue(record),
    updatedValue: null,
    details: { assessmentDate: record.assessmentDate }
  });
  await batch.commit();
  return { recordId: record.id };
}

export async function fetchFatigueRiskReportTrainerNames(request: {
  dateFrom: string;
  dateTo: string;
}) {
  const records = (await loadSummaries()).filter((record) =>
    (!request.dateFrom || record.assessmentDate >= request.dateFrom) &&
    (!request.dateTo || record.assessmentDate <= request.dateTo)
  );
  return Array.from(new Set(records.map((record) => record.instructorName).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
}

export async function fetchFatigueRiskReportRecords(request: {
  dateFrom: string;
  dateTo: string;
  trainerName: string;
}) {
  const trainer = text(request.trainerName).toLowerCase();
  const summaries = (await loadSummaries()).filter((record) =>
    (!request.dateFrom || record.assessmentDate >= request.dateFrom) &&
    (!request.dateTo || record.assessmentDate <= request.dateTo) &&
    (!trainer || record.instructorName.toLowerCase() === trainer)
  );
  return Promise.all(summaries.map(detailFromSummary));
}
