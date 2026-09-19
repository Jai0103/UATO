import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference
} from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase-client";
import { postToGoogle } from "@/lib/google-api";
import type {
  StaffTrainingDescription,
  StaffTrainingEntry,
  StaffTrainingItemStatus,
  StaffTrainingRecord,
  StaffTrainingRecordSummary,
  StaffTrainingType
} from "@/lib/staff-training";

export type StaffTrainingRecordsPage = {
  records: StaffTrainingRecordSummary[];
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

type FirestoreOperation =
  | { type: "set"; reference: DocumentReference<DocumentData>; data: DocumentData }
  | { type: "delete"; reference: DocumentReference<DocumentData> };

const WRITE_BATCH_SIZE = 400;
const SUMMARY_CACHE_MS = 60_000;
const DESCRIPTION_CACHE_MS = 5 * 60_000;
const TRAINING_TYPES: StaffTrainingType[] = ["induction", "currency", "upgrade"];

let summaryCache: {
  expiresAt: number;
  records: StaffTrainingRecordSummary[];
} | null = null;
let descriptionCache: {
  expiresAt: number;
  descriptions: StaffTrainingDescription[];
} | null = null;

export class StaffTrainingFirebaseError extends Error {
  code: string;

  constructor(message: string, code = "STAFF_TRAINING_ERROR") {
    super(message);
    this.name = "StaffTrainingFirebaseError";
    this.code = code;
  }
}

async function requireFirebaseUser() {
  await firebaseAuth.authStateReady();
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new StaffTrainingFirebaseError(
      "Your Firebase session has expired. Please sign in again.",
      "AUTH_REQUIRED"
    );
  }
  return user;
}

function text(value: unknown) {
  return String(value ?? "");
}

function safeId(value: unknown) {
  return text(value).trim().replace(/\//g, "_");
}

function entryDocumentId(recordId: string, itemId: string) {
  return `${safeId(recordId)}__${safeId(itemId)}`;
}

function toIsoString(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return text(value);
}

function safeTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Timestamp.now() : Timestamp.fromDate(date);
}

function timestampsMatch(expected: string, current: unknown) {
  const expectedTime = new Date(expected).getTime();
  const currentText = toIsoString(current);
  const currentTime = new Date(currentText).getTime();
  return Number.isFinite(expectedTime) && Number.isFinite(currentTime)
    ? expectedTime === currentTime
    : expected === currentText;
}

function trainingType(value: unknown): StaffTrainingType {
  const type = text(value) as StaffTrainingType;
  return TRAINING_TYPES.includes(type) ? type : "induction";
}

function itemStatus(value: unknown): StaffTrainingItemStatus {
  const status = text(value);
  if (
    status === "not_completed" ||
    status === "in_progress" ||
    status === "completed"
  ) {
    return status;
  }
  return "";
}

function descriptionFromDocument(data: DocumentData): StaffTrainingDescription {
  return {
    id: text(data.id),
    trainingType: trainingType(data.trainingType),
    description: text(data.description),
    sortOrder: Number(data.sortOrder) || 0,
    status: data.status === "inactive" ? "inactive" : "active"
  };
}

function entryFromDocument(data: DocumentData): StaffTrainingEntry {
  return {
    itemId: text(data.itemId),
    trainingType: trainingType(data.trainingType),
    description: text(data.description),
    sortOrder: Number(data.sortOrder) || 0,
    status: itemStatus(data.status),
    dateCompleted: text(data.dateCompleted).slice(0, 10),
    remarks: text(data.remarks)
  };
}

function summaryFromDocument(id: string, data: DocumentData): StaffTrainingRecordSummary {
  return {
    id,
    staffName: text(data.staffName),
    staffEmail: text(data.staffEmail),
    designation: text(data.designation),
    headOfTrainingName: text(data.headOfTrainingName),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
    completedCount: Number(data.completedCount) || 0,
    totalCount: Number(data.totalCount) || 0
  };
}

async function commitOperations(operations: FirestoreOperation[]) {
  for (let start = 0; start < operations.length; start += WRITE_BATCH_SIZE) {
    const batch = writeBatch(firestore);
    operations.slice(start, start + WRITE_BATCH_SIZE).forEach((operation) => {
      if (operation.type === "delete") batch.delete(operation.reference);
      else batch.set(operation.reference, operation.data);
    });
    await batch.commit();
  }
}

function invalidateCaches() {
  summaryCache = null;
  descriptionCache = null;
}

async function loadSummaries(force = false) {
  await requireFirebaseUser();
  if (!force && summaryCache && summaryCache.expiresAt > Date.now()) {
    return summaryCache.records;
  }

  const snapshot = await getDocs(collection(firestore, "staffTrainingRecords"));
  const records = snapshot.docs
    .map((item) => summaryFromDocument(item.id, item.data()))
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  summaryCache = { expiresAt: Date.now() + SUMMARY_CACHE_MS, records };
  return records;
}

function validateRecord(record: StaffTrainingRecord) {
  if (!safeId(record.id)) return "The staff training record ID is missing.";
  if (!record.staffName.trim()) return "Enter the staff name.";
  if (!record.staffEmail.trim()) return "Enter the staff email.";
  if (!record.designation.trim()) return "Enter the staff designation.";
  if (!record.headOfTrainingName.trim()) return "Enter the Head of Training name.";
  if (!Array.isArray(record.items) || !record.items.length) {
    return "At least one training checklist item is required.";
  }
  if (record.items.length > 200) return "The checklist exceeds the 200-item limit.";

  const itemIds = new Set<string>();
  for (const item of record.items) {
    if (!safeId(item.itemId) || !item.description.trim()) {
      return "Every training item requires an ID and description.";
    }
    if (itemIds.has(item.itemId)) return "The checklist contains duplicate items.";
    itemIds.add(item.itemId);
    if (item.status === "completed" && !/^\d{4}-\d{2}-\d{2}$/.test(item.dateCompleted)) {
      return `Add a valid completion date for: ${item.description}`;
    }
  }
  return "";
}

function writeAudit(
  auditAction:
    | "STAFF_TRAINING_CREATED"
    | "STAFF_TRAINING_UPDATED"
    | "STAFF_TRAINING_DELETED"
    | "STAFF_TRAINING_DESCRIPTIONS_UPDATED",
  record: StaffTrainingRecord | StaffTrainingDescription[],
  previousRecord: StaffTrainingRecord | StaffTrainingDescription[] | null
) {
  void postToGoogle<{ auditId?: string }>({
    action: "recordFirebaseStaffTrainingAudit",
    auditAction,
    record,
    previousRecord
  }).catch((error) => {
    console.error("Staff Training audit sync failed", error);
  });
}

export async function fetchStaffTrainingDescriptions(force = false) {
  await requireFirebaseUser();
  if (!force && descriptionCache && descriptionCache.expiresAt > Date.now()) {
    return descriptionCache.descriptions;
  }

  const snapshot = await getDocs(collection(firestore, "staffTrainingDescriptions"));
  const descriptions = snapshot.docs
    .map((item) => descriptionFromDocument(item.data()))
    .sort(
      (first, second) =>
        TRAINING_TYPES.indexOf(first.trainingType) -
          TRAINING_TYPES.indexOf(second.trainingType) ||
        first.sortOrder - second.sortOrder
    );
  descriptionCache = {
    expiresAt: Date.now() + DESCRIPTION_CACHE_MS,
    descriptions
  };
  return descriptions;
}

export async function saveStaffTrainingDescriptions(
  descriptions: StaffTrainingDescription[]
) {
  await requireFirebaseUser();
  const previousDescriptions = await fetchStaffTrainingDescriptions(true);
  const existing = await getDocs(collection(firestore, "staffTrainingDescriptions"));
  const operations: FirestoreOperation[] = existing.docs.map((item) => ({
    type: "delete",
    reference: item.ref
  }));

  descriptions.forEach((item) => {
    operations.push({
      type: "set",
      reference: doc(firestore, "staffTrainingDescriptions", safeId(item.id)),
      data: {
        id: item.id,
        trainingType: item.trainingType,
        description: item.description.trim(),
        descriptionLower: item.description.trim().toLowerCase(),
        sortOrder: Number(item.sortOrder) || 0,
        status: item.status === "inactive" ? "inactive" : "active",
        updatedAt: Timestamp.now(),
        source: "firebase-live",
        schemaVersion: 2
      }
    });
  });

  await commitOperations(operations);
  invalidateCaches();
  writeAudit(
    "STAFF_TRAINING_DESCRIPTIONS_UPDATED",
    descriptions,
    previousDescriptions
  );
  return descriptions;
}

export async function fetchStaffTrainingRecords() {
  return loadSummaries();
}

export async function fetchStaffTrainingRecordsPage(
  request: {
    page?: number;
    pageSize?: number;
    query?: string;
    year?: string;
  } = {}
) {
  const pageSize = Math.max(1, Math.min(Number(request.pageSize) || 10, 25));
  const requestedPage = Math.max(1, Number(request.page) || 1);
  const search = text(request.query).trim().toLowerCase();
  const year = text(request.year).trim();
  const records = (await loadSummaries()).filter((record) => {
    const recordYear = (record.updatedAt || record.createdAt).slice(0, 4);
    if (year && recordYear !== year) return false;
    if (!search) return true;
    return [record.staffName, record.staffEmail, record.designation].some((value) =>
      value.toLowerCase().includes(search)
    );
  });

  const totalRecords = records.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * pageSize;
  return {
    records: records.slice(start, start + pageSize),
    page,
    pageSize,
    totalRecords,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages
  } satisfies StaffTrainingRecordsPage;
}

export async function fetchStaffTrainingRecord(recordId: string) {
  await requireFirebaseUser();
  const cleanId = safeId(recordId);
  if (!cleanId) throw new StaffTrainingFirebaseError("Record ID is required.");

  const [recordSnapshot, entriesSnapshot, signatureSnapshot] = await Promise.all([
    getDoc(doc(firestore, "staffTrainingRecords", cleanId)),
    getDocs(
      query(
        collection(firestore, "staffTrainingEntries"),
        where("recordId", "==", recordId)
      )
    ),
    getDoc(doc(firestore, "staffTrainingSignatures", cleanId))
  ]);
  if (!recordSnapshot.exists()) {
    throw new StaffTrainingFirebaseError(
      "The Staff Training record was not found in Firebase.",
      "NOT_FOUND"
    );
  }

  const data = recordSnapshot.data();
  return {
    id: recordSnapshot.id,
    staffName: text(data.staffName),
    staffEmail: text(data.staffEmail),
    designation: text(data.designation),
    headOfTrainingName: text(data.headOfTrainingName),
    signatureDataUrl: signatureSnapshot.exists()
      ? text(signatureSnapshot.data().signatureDataUrl)
      : "",
    items: entriesSnapshot.docs
      .map((item) => entryFromDocument(item.data()))
      .sort(
        (first, second) =>
          TRAINING_TYPES.indexOf(first.trainingType) -
            TRAINING_TYPES.indexOf(second.trainingType) ||
          first.sortOrder - second.sortOrder
      ),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt)
  } satisfies StaffTrainingRecord;
}

export async function saveStaffTrainingRecord(record: StaffTrainingRecord) {
  const user = await requireFirebaseUser();
  const validation = validateRecord(record);
  if (validation) {
    throw new StaffTrainingFirebaseError(validation, "VALIDATION_FAILED");
  }

  const cleanId = safeId(record.id);
  const previousRecord = await fetchStaffTrainingRecord(record.id).catch((error) => {
    if (error instanceof StaffTrainingFirebaseError && error.code === "NOT_FOUND") {
      return null;
    }
    throw error;
  });
  const existingEntries = await getDocs(
    query(
      collection(firestore, "staffTrainingEntries"),
      where("recordId", "==", record.id)
    )
  );
  const now = new Date();
  const updatedAt = now.toISOString();
  const createdAt = previousRecord?.createdAt || record.createdAt || updatedAt;
  const savedRecord: StaffTrainingRecord = {
    ...record,
    createdAt,
    updatedAt
  };

  await runTransaction(firestore, async (transaction) => {
    const recordReference = doc(firestore, "staffTrainingRecords", cleanId);
    const currentRecord = await transaction.get(recordReference);
    if (
      currentRecord.exists() &&
      (!record.updatedAt || !timestampsMatch(record.updatedAt, currentRecord.data().updatedAt))
    ) {
      throw new StaffTrainingFirebaseError(
        "This staff training record was updated in another session. Reopen the latest record before saving again.",
        "RECORD_CONFLICT"
      );
    }

    existingEntries.docs.forEach((item) => transaction.delete(item.ref));
    transaction.set(recordReference, {
      id: record.id,
      staffName: record.staffName.trim(),
      staffNameLower: record.staffName.trim().toLowerCase(),
      staffEmail: record.staffEmail.trim(),
      staffEmailLower: record.staffEmail.trim().toLowerCase(),
      designation: record.designation.trim(),
      headOfTrainingName: record.headOfTrainingName.trim(),
      completedCount: record.items.filter((item) => item.status === "completed").length,
      totalCount: record.items.length,
      createdAt: safeTimestamp(createdAt),
      updatedAt: Timestamp.fromDate(now),
      updatedByUid: user.uid,
      updatedByEmail: user.email || "",
      source: "firebase-live",
      schemaVersion: 2
    });

    record.items.forEach((item) => {
      transaction.set(
        doc(
          firestore,
          "staffTrainingEntries",
          entryDocumentId(record.id, item.itemId)
        ),
        {
          recordId: record.id,
          itemId: item.itemId,
          trainingType: item.trainingType,
          description: item.description,
          sortOrder: item.sortOrder,
          status: item.status,
          dateCompleted: item.dateCompleted,
          remarks: item.remarks,
          updatedAt: Timestamp.fromDate(now),
          schemaVersion: 2
        }
      );
    });

    const signatureReference = doc(firestore, "staffTrainingSignatures", cleanId);
    if (record.signatureDataUrl) {
      transaction.set(signatureReference, {
        recordId: record.id,
        signatureDataUrl: record.signatureDataUrl,
        updatedAt: Timestamp.fromDate(now),
        schemaVersion: 2
      });
    } else {
      transaction.delete(signatureReference);
    }
    transaction.delete(doc(firestore, "staffTrainingTombstones", cleanId));
  });

  invalidateCaches();
  writeAudit(
    previousRecord ? "STAFF_TRAINING_UPDATED" : "STAFF_TRAINING_CREATED",
    savedRecord,
    previousRecord
  );
  return savedRecord;
}

export async function deleteStaffTrainingRecord(recordId: string) {
  const user = await requireFirebaseUser();
  const existingRecord = await fetchStaffTrainingRecord(recordId);
  const cleanId = safeId(recordId);
  const entries = await getDocs(
    query(
      collection(firestore, "staffTrainingEntries"),
      where("recordId", "==", recordId)
    )
  );
  const operations: FirestoreOperation[] = entries.docs.map((item) => ({
    type: "delete",
    reference: item.ref
  }));
  operations.push(
    { type: "delete", reference: doc(firestore, "staffTrainingRecords", cleanId) },
    { type: "delete", reference: doc(firestore, "staffTrainingSignatures", cleanId) },
    {
      type: "set",
      reference: doc(firestore, "staffTrainingTombstones", cleanId),
      data: {
        recordId,
        staffName: existingRecord.staffName,
        deletedAt: Timestamp.now(),
        deletedByUid: user.uid,
        deletedByEmail: user.email || "",
        schemaVersion: 1
      }
    }
  );

  await commitOperations(operations);
  invalidateCaches();
  writeAudit("STAFF_TRAINING_DELETED", existingRecord, existingRecord);
  return { recordId };
}

export async function fetchStaffTrainingReportRecords(payload: {
  staffName?: string;
  monthFrom: string;
  monthTo: string;
}) {
  const queryText = text(payload.staffName).trim().toLowerCase();
  const summaries = (await loadSummaries()).filter(
    (record) => !queryText || record.staffName.toLowerCase().includes(queryText)
  );
  const records: StaffTrainingRecord[] = [];

  for (let start = 0; start < summaries.length; start += 5) {
    const details = await Promise.all(
      summaries
        .slice(start, start + 5)
        .map((summary) => fetchStaffTrainingRecord(summary.id))
    );
    records.push(
      ...details.filter((record) =>
        record.items.some((item) => {
          const month = item.dateCompleted.slice(0, 7);
          return month && month >= payload.monthFrom && month <= payload.monthTo;
        })
      )
    );
  }

  return records
    .slice(0, 100)
    .sort((first, second) => first.staffName.localeCompare(second.staffName));
}

export async function setupStaffTraining() {
  await requireFirebaseUser();
  return { message: "Staff Training is configured in Firebase." };
}
