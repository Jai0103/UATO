import {
  collection,
  doc,
  getDocs,
  Timestamp,
  writeBatch
} from "firebase/firestore";
import { sessionKey } from "@/lib/demo-auth";
import { firestore } from "@/lib/firebase-client";
import type { FatigueRiskRecordsPage } from "@/lib/fatigue-risk-api";
import {
  FATIGUE_RISK_QUESTIONS,
  type FatigueRiskQuestion,
  type FatigueRiskRecord,
  type FatigueRiskResponse
} from "@/lib/fatigue-risk";
import { googleAppsScriptUrl } from "@/lib/google-api";

const PAGE_SIZE = 25;
const DETAIL_CONCURRENCY = 2;
const WRITE_BATCH_SIZE = 400;
const READ_TIMEOUT_MS = 90_000;
const READ_ATTEMPTS = 3;
const MAX_SIGNATURE_BYTES = 750_000;

const migrationCollections = [
  "fatigueRiskQuestions",
  "fatigueRiskRecords",
  "fatigueRiskResponses",
  "fatigueRiskSignatures"
] as const;

export type FatigueRiskMigrationAnalysis = {
  questions: FatigueRiskQuestion[];
  records: FatigueRiskRecord[];
  questionCount: number;
  recordCount: number;
  responseCount: number;
  answeredCount: number;
  riskCount: number;
  signatureCount: number;
  submittedCount: number;
  reviewedCount: number;
  invalidItems: string[];
  duplicateItems: string[];
  oversizedSignatures: string[];
};

export type FatigueRiskMigrationVerification = {
  verified: boolean;
  expected: Record<string, number>;
  actual: Record<string, number>;
  mismatches: string[];
};

function asText(value: unknown) {
  return String(value ?? "");
}

function safeId(value: unknown) {
  return asText(value).trim().replace(/\//g, "_");
}

function responseDocumentId(recordId: string, questionId: string) {
  return safeId(recordId) + "__" + safeId(questionId);
}

function signatureSize(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function comparableQuestion(item: FatigueRiskQuestion) {
  return {
    id: asText(item.id),
    sectionId: item.sectionId,
    sectionLabel: asText(item.sectionLabel),
    question: asText(item.question),
    sortOrder: Number(item.sortOrder) || 0
  };
}

function comparableRecord(record: FatigueRiskRecord) {
  const answeredCount = record.responses.filter((item) => Boolean(item.response)).length;
  const riskCount = record.responses.filter((item) => item.response === "yes").length;
  return {
    id: asText(record.id),
    assessmentDate: asText(record.assessmentDate),
    instructorName: asText(record.instructorName),
    instructorEmail: asText(record.instructorEmail),
    recommendation: asText(record.recommendation),
    evaluatedBy: asText(record.evaluatedBy),
    evaluatorPosition: asText(record.evaluatorPosition),
    status: record.status,
    createdAt: asText(record.createdAt),
    updatedAt: asText(record.updatedAt),
    riskCount,
    answeredCount,
    totalQuestions: record.responses.length,
    signatureCaptured: Boolean(record.signatureDataUrl)
  };
}

function comparableResponse(recordId: string, item: FatigueRiskResponse) {
  return {
    recordId: asText(recordId),
    questionId: asText(item.questionId),
    response: item.response
  };
}

function migrationSessionToken() {
  try {
    const raw = localStorage.getItem(sessionKey);
    if (!raw) return "";
    return asText((JSON.parse(raw) as { sessionToken?: string }).sessionToken);
  } catch {
    return "";
  }
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

async function migrationGooglePost<T>(payload: Record<string, unknown>) {
  const sessionToken = migrationSessionToken();
  if (!sessionToken) {
    throw new Error("Your normal application session has expired. Sign in again before migration.");
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
    try {
      const response = await fetch(googleAppsScriptUrl, {
        method: "POST",
        body: JSON.stringify({ ...payload, sessionToken }),
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal
      });
      if (!response.ok) throw new Error("Google Sheets returned HTTP " + response.status + ".");
      const data = (await response.json()) as T & {
        ok?: boolean;
        success?: boolean;
        error?: string;
        message?: string;
      };
      if (data.ok === false || data.success === false) {
        throw new Error(data.error || data.message || "Google Sheets rejected the request.");
      }
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < READ_ATTEMPTS) await wait(attempt * 1_500);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  if (lastError instanceof DOMException && lastError.name === "AbortError") {
    throw new Error("Google Sheets did not respond after three extended attempts. Wait one minute and retry.");
  }
  throw lastError instanceof Error ? lastError : new Error("Unable to load Google Sheets for migration.");
}

async function loadSummaries() {
  const request = {
    action: "getFatigueRiskRecordsPage",
    pageSize: PAGE_SIZE,
    query: "",
    year: "",
    month: ""
  };
  const first = await migrationGooglePost<FatigueRiskRecordsPage>({ ...request, page: 1 });
  const records = [...(first.records || [])];
  for (let page = 2; page <= first.totalPages; page += 1) {
    const result = await migrationGooglePost<FatigueRiskRecordsPage>({ ...request, page });
    records.push(...(result.records || []));
  }
  return records;
}

async function loadDetails(recordIds: string[]) {
  const records: FatigueRiskRecord[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < recordIds.length) {
      const index = nextIndex;
      nextIndex += 1;
      const response = await migrationGooglePost<{ record: FatigueRiskRecord }>({
        action: "getFatigueRiskRecord",
        recordId: recordIds[index]
      });
      records[index] = response.record;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(DETAIL_CONCURRENCY, recordIds.length) }, () => worker())
  );
  return records.filter(Boolean);
}

export async function loadGoogleFatigueRiskSource() {
  const summaries = await loadSummaries();
  return loadDetails(summaries.map((record) => record.id).filter(Boolean));
}

export function analyzeFatigueRiskMigration(
  records: FatigueRiskRecord[]
): FatigueRiskMigrationAnalysis {
  const invalidItems: string[] = [];
  const duplicateItems: string[] = [];
  const oversizedSignatures: string[] = [];
  const questionIds = new Set<string>();
  const recordIds = new Set<string>();
  const responseIds = new Set<string>();
  let responseCount = 0;
  let answeredCount = 0;
  let riskCount = 0;
  let signatureCount = 0;

  FATIGUE_RISK_QUESTIONS.forEach((question, index) => {
    const id = safeId(question.id);
    if (!id || !asText(question.question).trim()) {
      invalidItems.push("Question " + (index + 1) + " has an empty ID or text.");
    }
    if (questionIds.has(id)) duplicateItems.push("Question ID: " + id);
    questionIds.add(id);
  });

  records.forEach((record, index) => {
    const id = safeId(record.id);
    if (!id || !asText(record.instructorName).trim() || !asText(record.assessmentDate).trim()) {
      invalidItems.push("Record " + (index + 1) + " has an empty ID, trainer, or date.");
    }
    if (recordIds.has(id)) duplicateItems.push("Record ID: " + id);
    recordIds.add(id);

    if (record.signatureDataUrl) {
      signatureCount += 1;
      if (signatureSize(record.signatureDataUrl) > MAX_SIGNATURE_BYTES) {
        oversizedSignatures.push(record.instructorName + " - " + record.assessmentDate);
      }
    }

    record.responses.forEach((response) => {
      responseCount += 1;
      if (response.response) answeredCount += 1;
      if (response.response === "yes") riskCount += 1;
      const responseId = responseDocumentId(record.id, response.questionId);
      if (!safeId(response.questionId)) {
        invalidItems.push(record.instructorName + ": response has an empty question ID.");
      }
      if (responseIds.has(responseId)) duplicateItems.push("Response ID: " + responseId);
      responseIds.add(responseId);
    });
  });

  return {
    questions: FATIGUE_RISK_QUESTIONS,
    records,
    questionCount: FATIGUE_RISK_QUESTIONS.length,
    recordCount: records.length,
    responseCount,
    answeredCount,
    riskCount,
    signatureCount,
    submittedCount: records.filter((record) => record.status === "submitted").length,
    reviewedCount: records.filter((record) => record.status === "reviewed").length,
    invalidItems,
    duplicateItems,
    oversizedSignatures
  };
}

async function commitOperations(
  operations: Array<{
    type: "set" | "delete";
    reference: ReturnType<typeof doc>;
    data?: Record<string, unknown>;
  }>
) {
  for (let start = 0; start < operations.length; start += WRITE_BATCH_SIZE) {
    const batch = writeBatch(firestore);
    operations.slice(start, start + WRITE_BATCH_SIZE).forEach((operation) => {
      if (operation.type === "delete") batch.delete(operation.reference);
      else batch.set(operation.reference, operation.data || {});
    });
    await batch.commit();
  }
}

export async function migrateFatigueRiskToFirestore(
  analysis: FatigueRiskMigrationAnalysis,
  migratedBy: { uid: string; email: string }
) {
  if (
    analysis.invalidItems.length ||
    analysis.duplicateItems.length ||
    analysis.oversizedSignatures.length
  ) {
    throw new Error("Resolve invalid, duplicate, or oversized Fatigue Risk data before migration.");
  }

  const operations: Array<{
    type: "set" | "delete";
    reference: ReturnType<typeof doc>;
    data?: Record<string, unknown>;
  }> = [];
  for (const collectionName of migrationCollections) {
    const snapshot = await getDocs(collection(firestore, collectionName));
    snapshot.docs.forEach((item) => operations.push({ type: "delete", reference: item.ref }));
  }

  analysis.questions.forEach((question) => {
    operations.push({
      type: "set",
      reference: doc(firestore, "fatigueRiskQuestions", safeId(question.id)),
      data: {
        ...comparableQuestion(question),
        migratedAt: Timestamp.now(),
        schemaVersion: 1
      }
    });
  });

  analysis.records.forEach((record) => {
    operations.push({
      type: "set",
      reference: doc(firestore, "fatigueRiskRecords", safeId(record.id)),
      data: {
        ...comparableRecord(record),
        instructorNameLower: asText(record.instructorName).toLowerCase(),
        migratedAt: Timestamp.now(),
        schemaVersion: 1
      }
    });
    record.responses.forEach((response) => {
      operations.push({
        type: "set",
        reference: doc(
          firestore,
          "fatigueRiskResponses",
          responseDocumentId(record.id, response.questionId)
        ),
        data: {
          ...comparableResponse(record.id, response),
          migratedAt: Timestamp.now(),
          schemaVersion: 1
        }
      });
    });
    if (record.signatureDataUrl) {
      operations.push({
        type: "set",
        reference: doc(firestore, "fatigueRiskSignatures", safeId(record.id)),
        data: {
          recordId: asText(record.id),
          signatureDataUrl: asText(record.signatureDataUrl),
          migratedAt: Timestamp.now(),
          schemaVersion: 1
        }
      });
    }
  });

  await commitOperations(operations);
  const runId = "fatigue-risk-" + Date.now();
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, "migrationRuns", runId), {
    id: runId,
    type: "fatigue-risk",
    questionCount: analysis.questionCount,
    recordCount: analysis.recordCount,
    responseCount: analysis.responseCount,
    signatureCount: analysis.signatureCount,
    migratedByUid: migratedBy.uid,
    migratedByEmail: migratedBy.email,
    completedAt: Timestamp.now(),
    source: "google-sheets"
  });
  await batch.commit();
  return { runId };
}

function pick(actual: Record<string, unknown>, expected: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(expected).map((key) => [key, actual[key]]));
}

export async function verifyFatigueRiskMigration(
  analysis: FatigueRiskMigrationAnalysis
): Promise<FatigueRiskMigrationVerification> {
  const snapshots = await Promise.all(
    migrationCollections.map((name) => getDocs(collection(firestore, name)))
  );
  const stores = Object.fromEntries(
    snapshots.map((snapshot, index) => [
      migrationCollections[index],
      new Map(snapshot.docs.map((item) => [item.id, item.data()]))
    ])
  ) as Record<(typeof migrationCollections)[number], Map<string, Record<string, unknown>>>;
  const mismatches: string[] = [];

  analysis.questions.forEach((question) => {
    const expected = comparableQuestion(question);
    const actual = stores.fatigueRiskQuestions.get(safeId(question.id));
    if (!actual) mismatches.push("Missing question: " + question.id);
    else if (JSON.stringify(pick(actual, expected)) !== JSON.stringify(expected)) {
      mismatches.push("Question differs: " + question.id);
    }
  });

  analysis.records.forEach((record) => {
    const expectedRecord = comparableRecord(record);
    const actualRecord = stores.fatigueRiskRecords.get(safeId(record.id));
    if (!actualRecord) {
      mismatches.push("Missing record: " + record.instructorName + " - " + record.assessmentDate);
    } else if (JSON.stringify(pick(actualRecord, expectedRecord)) !== JSON.stringify(expectedRecord)) {
      mismatches.push("Record differs: " + record.instructorName + " - " + record.assessmentDate);
    }

    record.responses.forEach((response) => {
      const expected = comparableResponse(record.id, response);
      const actual = stores.fatigueRiskResponses.get(
        responseDocumentId(record.id, response.questionId)
      );
      if (!actual) mismatches.push("Missing response: " + record.id + " - " + response.questionId);
      else if (JSON.stringify(pick(actual, expected)) !== JSON.stringify(expected)) {
        mismatches.push("Response differs: " + record.id + " - " + response.questionId);
      }
    });

    const signature = stores.fatigueRiskSignatures.get(safeId(record.id));
    if (record.signatureDataUrl && signature?.signatureDataUrl !== record.signatureDataUrl) {
      mismatches.push("Signature differs: " + record.instructorName + " - " + record.assessmentDate);
    }
    if (!record.signatureDataUrl && signature) {
      mismatches.push("Unexpected signature: " + record.instructorName + " - " + record.assessmentDate);
    }
  });

  const expected = {
    questions: analysis.questionCount,
    records: analysis.recordCount,
    responses: analysis.responseCount,
    signatures: analysis.signatureCount
  };
  const actual = {
    questions: stores.fatigueRiskQuestions.size,
    records: stores.fatigueRiskRecords.size,
    responses: stores.fatigueRiskResponses.size,
    signatures: stores.fatigueRiskSignatures.size
  };
  Object.keys(expected).forEach((key) => {
    const countKey = key as keyof typeof expected;
    if (expected[countKey] !== actual[countKey]) {
      mismatches.push(
        key + " count differs: " + actual[countKey] + " / " + expected[countKey]
      );
    }
  });

  return {
    verified: mismatches.length === 0,
    expected,
    actual,
    mismatches: mismatches.slice(0, 100)
  };
}
