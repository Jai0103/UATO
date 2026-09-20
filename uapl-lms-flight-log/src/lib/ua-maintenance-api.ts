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
import {
  addFirebaseAuditToTransaction,
  writeFirebaseAudit
} from "@/lib/firebase-audit";
import type {
  UaMaintenanceEntry,
  UaMaintenanceMasterData,
  UaMaintenanceMasterItem,
  UaMaintenanceMasterSection,
  UaMaintenanceRecord,
  UaMaintenanceRecordSummary
} from "@/lib/ua-maintenance";

export type UaMaintenanceRecordsPage = {
  records: UaMaintenanceRecordSummary[];
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

const MASTER_SECTIONS: UaMaintenanceMasterSection[] = [
  "uaModels",
  "uaIds",
  "descriptions"
];
const WRITE_BATCH_SIZE = 400;
const SUMMARY_CACHE_MS = 60_000;
const MASTER_DATA_CACHE_MS = 5 * 60_000;

let summaryCache: {
  expiresAt: number;
  records: UaMaintenanceRecordSummary[];
} | null = null;
let masterDataCache: {
  expiresAt: number;
  value: UaMaintenanceMasterData;
} | null = null;
let actorCache: {
  expiresAt: number;
  uid: string;
  name: string;
  email: string;
  role: "admin";
} | null = null;

export class UaMaintenanceFirebaseError extends Error {
  code: string;

  constructor(message: string, code = "UA_MAINTENANCE_ERROR") {
    super(message);
    this.name = "UaMaintenanceFirebaseError";
    this.code = code;
  }
}

async function requireFirebaseUser() {
  await firebaseAuth.authStateReady();
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new UaMaintenanceFirebaseError(
      "Your Firebase session has expired. Please sign in again.",
      "AUTH_REQUIRED"
    );
  }
  if (actorCache && actorCache.uid === user.uid && actorCache.expiresAt > Date.now()) {
    return actorCache;
  }

  const profile = await getDoc(doc(firestore, "users", user.uid));
  if (
    !profile.exists() ||
    profile.data().status !== "active" ||
    profile.data().role !== "admin"
  ) {
    throw new UaMaintenanceFirebaseError(
      "Administrator access is required.",
      "ADMIN_REQUIRED"
    );
  }

  actorCache = {
    expiresAt: Date.now() + 2 * 60_000,
    uid: user.uid,
    name: text(profile.data().name || user.displayName || user.email || "Administrator"),
    email: text(profile.data().email || user.email).trim().toLowerCase(),
    role: "admin"
  };
  return actorCache;
}

function text(value: unknown) {
  return String(value ?? "");
}

function safeId(value: unknown) {
  return text(value).trim().replace(/\//g, "_");
}

function masterDocumentId(section: UaMaintenanceMasterSection, id: string) {
  return `${section}__${safeId(id)}`;
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

function emptyMasterData(): UaMaintenanceMasterData {
  return { uaModels: [], uaIds: [], descriptions: [] };
}

function masterItemFromDocument(data: DocumentData): UaMaintenanceMasterItem {
  return {
    id: text(data.id),
    value: text(data.value),
    linkedUaId: text(data.linkedUaId),
    sortOrder: Number(data.sortOrder) || 0,
    status: data.status === "inactive" ? "inactive" : "active"
  };
}

function entryFromDocument(data: DocumentData): UaMaintenanceEntry {
  const status = text(data.status);
  return {
    itemId: text(data.itemId),
    description: text(data.description),
    sortOrder: Number(data.sortOrder) || 0,
    status:
      status === "pass" || status === "fail" || status === "na" ? status : "",
    remarks: text(data.remarks)
  };
}

function summaryFromDocument(id: string, data: DocumentData): UaMaintenanceRecordSummary {
  return {
    id,
    uaModel: text(data.uaModel),
    uaId: text(data.uaId),
    inspectionDate: text(data.inspectionDate).slice(0, 10),
    recommendation: text(data.recommendation),
    checkedByName: text(data.checkedByName),
    checkedByIdNo: text(data.checkedByIdNo),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
    passCount: Number(data.passCount) || 0,
    failCount: Number(data.failCount) || 0,
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
  masterDataCache = null;
}

async function loadSummaries(force = false) {
  await requireFirebaseUser();
  if (!force && summaryCache && summaryCache.expiresAt > Date.now()) {
    return summaryCache.records;
  }

  const snapshot = await getDocs(collection(firestore, "uaMaintenanceRecords"));
  const records = snapshot.docs
    .map((item) => summaryFromDocument(item.id, item.data()))
    .sort((first, second) => {
      const dateOrder = second.inspectionDate.localeCompare(first.inspectionDate);
      return dateOrder || second.updatedAt.localeCompare(first.updatedAt);
    });

  summaryCache = { expiresAt: Date.now() + SUMMARY_CACHE_MS, records };
  return records;
}

function validateRecord(record: UaMaintenanceRecord) {
  if (!safeId(record.id)) return "The maintenance record ID is missing.";
  if (!record.uaModel.trim()) return "Select the UA Brand / Model.";
  if (!record.uaId.trim()) return "Select the UA ID No.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.inspectionDate)) {
    return "Enter a valid maintenance date.";
  }
  if (!record.checkedByName.trim()) return "Enter the checker name.";
  if (!record.checkedByIdNo.trim()) return "Enter the checker ID number.";
  if (!Array.isArray(record.items) || !record.items.length) {
    return "At least one maintenance checklist item is required.";
  }
  if (record.items.length > 200) return "The checklist exceeds the 200-item limit.";

  const itemIds = new Set<string>();
  for (const item of record.items) {
    if (!safeId(item.itemId) || !item.description.trim()) {
      return "Every checklist item requires an ID and description.";
    }
    if (itemIds.has(item.itemId)) return "The checklist contains duplicate items.";
    itemIds.add(item.itemId);
  }
  return "";
}

function recordAuditValue(record: UaMaintenanceRecord) {
  return {
    id: record.id,
    uaModel: record.uaModel,
    uaId: record.uaId,
    inspectionDate: record.inspectionDate,
    recommendation: record.recommendation,
    checkedByName: record.checkedByName,
    checkedByIdNo: record.checkedByIdNo,
    signatureCaptured: Boolean(record.signatureDataUrl),
    items: record.items,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function masterDataAuditValue(masterData: UaMaintenanceMasterData) {
  return {
    uaModels: masterData.uaModels,
    uaIds: masterData.uaIds,
    descriptions: masterData.descriptions
  };
}

export async function fetchUaMaintenanceMasterData(force = false) {
  await requireFirebaseUser();
  if (!force && masterDataCache && masterDataCache.expiresAt > Date.now()) {
    return masterDataCache.value;
  }

  const snapshot = await getDocs(collection(firestore, "uaMaintenanceMasterData"));
  const result = emptyMasterData();
  snapshot.docs.forEach((item) => {
    const data = item.data();
    const section = text(data.section) as UaMaintenanceMasterSection;
    if (!MASTER_SECTIONS.includes(section)) return;
    result[section].push(masterItemFromDocument(data));
  });
  MASTER_SECTIONS.forEach((section) => {
    result[section].sort((first, second) => first.sortOrder - second.sortOrder);
  });

  masterDataCache = { expiresAt: Date.now() + MASTER_DATA_CACHE_MS, value: result };
  return result;
}

export async function saveUaMaintenanceMasterData(
  masterData: UaMaintenanceMasterData
) {
  const actor = await requireFirebaseUser();
  const previousMasterData = await fetchUaMaintenanceMasterData(true);
  const existing = await getDocs(collection(firestore, "uaMaintenanceMasterData"));
  const operations: FirestoreOperation[] = existing.docs.map((item) => ({
    type: "delete",
    reference: item.ref
  }));

  MASTER_SECTIONS.forEach((section) => {
    (masterData[section] || []).forEach((item, index) => {
      operations.push({
        type: "set",
        reference: doc(
          firestore,
          "uaMaintenanceMasterData",
          masterDocumentId(section, item.id)
        ),
        data: {
          id: item.id,
          section,
          value: item.value.trim(),
          valueLower: item.value.trim().toLowerCase(),
          linkedUaId: text(item.linkedUaId).trim(),
          sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : index,
          status: item.status === "inactive" ? "inactive" : "active",
          updatedAt: Timestamp.now(),
          source: "firebase-live",
          schemaVersion: 2
        }
      });
    });
  });

  await commitOperations(operations);
  invalidateCaches();
  await writeFirebaseAudit({
    actorUserId: actor.uid,
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "UA_MAINTENANCE_MASTER_DATA_UPDATED",
    entityType: "uaMaintenance",
    entityId: "master-data",
    entityName: "UA Maintenance Master Data",
    previousValue: masterDataAuditValue(previousMasterData),
    updatedValue: masterDataAuditValue(masterData),
    details: {
      uaModels: masterData.uaModels.length,
      descriptions: masterData.descriptions.length
    }
  });
  return masterData;
}

export async function fetchUaMaintenanceRecordsPage(
  request: {
    page?: number;
    pageSize?: number;
    query?: string;
    year?: string;
    month?: string;
  } = {}
) {
  const pageSize = Math.max(1, Math.min(Number(request.pageSize) || 10, 25));
  const requestedPage = Math.max(1, Number(request.page) || 1);
  const search = text(request.query).trim().toLowerCase();
  const year = text(request.year).trim();
  const month = text(request.month).trim().padStart(2, "0");
  const records = (await loadSummaries()).filter((record) => {
    if (year && record.inspectionDate.slice(0, 4) !== year) return false;
    if (request.month && record.inspectionDate.slice(5, 7) !== month) return false;
    if (!search) return true;
    return [record.uaModel, record.uaId, record.checkedByName].some((value) =>
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
  } satisfies UaMaintenanceRecordsPage;
}

export async function fetchUaMaintenanceRecord(recordId: string) {
  await requireFirebaseUser();
  const cleanId = safeId(recordId);
  if (!cleanId) throw new UaMaintenanceFirebaseError("Record ID is required.");

  const [recordSnapshot, entriesSnapshot, signatureSnapshot] = await Promise.all([
    getDoc(doc(firestore, "uaMaintenanceRecords", cleanId)),
    getDocs(
      query(
        collection(firestore, "uaMaintenanceEntries"),
        where("recordId", "==", recordId)
      )
    ),
    getDoc(doc(firestore, "uaMaintenanceSignatures", cleanId))
  ]);
  if (!recordSnapshot.exists()) {
    throw new UaMaintenanceFirebaseError(
      "The UA Maintenance record was not found in Firebase.",
      "NOT_FOUND"
    );
  }

  const data = recordSnapshot.data();
  return {
    id: recordSnapshot.id,
    uaModel: text(data.uaModel),
    uaId: text(data.uaId),
    inspectionDate: text(data.inspectionDate).slice(0, 10),
    recommendation: text(data.recommendation),
    checkedByName: text(data.checkedByName),
    checkedByIdNo: text(data.checkedByIdNo),
    signatureDataUrl: signatureSnapshot.exists()
      ? text(signatureSnapshot.data().signatureDataUrl)
      : "",
    items: entriesSnapshot.docs
      .map((item) => entryFromDocument(item.data()))
      .sort((first, second) => first.sortOrder - second.sortOrder),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt)
  } satisfies UaMaintenanceRecord;
}

export async function saveUaMaintenanceRecord(record: UaMaintenanceRecord) {
  const user = await requireFirebaseUser();
  const validation = validateRecord(record);
  if (validation) {
    throw new UaMaintenanceFirebaseError(validation, "VALIDATION_FAILED");
  }

  const cleanId = safeId(record.id);
  const previousRecord = await fetchUaMaintenanceRecord(record.id).catch((error) => {
    if (error instanceof UaMaintenanceFirebaseError && error.code === "NOT_FOUND") {
      return null;
    }
    throw error;
  });
  const existingEntries = await getDocs(
    query(
      collection(firestore, "uaMaintenanceEntries"),
      where("recordId", "==", record.id)
    )
  );
  const now = new Date();
  const updatedAt = now.toISOString();
  const createdAt = previousRecord?.createdAt || record.createdAt || updatedAt;
  const savedRecord: UaMaintenanceRecord = {
    ...record,
    createdAt,
    updatedAt
  };

  await runTransaction(firestore, async (transaction) => {
    const recordReference = doc(firestore, "uaMaintenanceRecords", cleanId);
    const currentRecord = await transaction.get(recordReference);
    if (
      currentRecord.exists() &&
      (!record.updatedAt || !timestampsMatch(record.updatedAt, currentRecord.data().updatedAt))
    ) {
      throw new UaMaintenanceFirebaseError(
        "This maintenance record was updated in another session. Reopen the latest record before saving again.",
        "RECORD_CONFLICT"
      );
    }

    existingEntries.docs.forEach((item) => transaction.delete(item.ref));
    const passCount = record.items.filter((item) => item.status === "pass").length;
    const failCount = record.items.filter((item) => item.status === "fail").length;
    transaction.set(recordReference, {
      id: record.id,
      uaModel: record.uaModel.trim(),
      uaModelLower: record.uaModel.trim().toLowerCase(),
      uaId: record.uaId.trim(),
      uaIdLower: record.uaId.trim().toLowerCase(),
      inspectionDate: record.inspectionDate,
      inspectionYear: Number(record.inspectionDate.slice(0, 4)),
      inspectionMonth: Number(record.inspectionDate.slice(5, 7)),
      recommendation: record.recommendation.trim(),
      checkedByName: record.checkedByName.trim(),
      checkedByIdNo: record.checkedByIdNo.trim(),
      passCount,
      failCount,
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
          "uaMaintenanceEntries",
          entryDocumentId(record.id, item.itemId)
        ),
        {
          recordId: record.id,
          itemId: item.itemId,
          description: item.description,
          sortOrder: item.sortOrder,
          status: item.status,
          remarks: item.remarks,
          updatedAt: Timestamp.fromDate(now),
          schemaVersion: 2
        }
      );
    });

    const signatureReference = doc(
      firestore,
      "uaMaintenanceSignatures",
      cleanId
    );
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
    transaction.delete(doc(firestore, "uaMaintenanceTombstones", cleanId));
    addFirebaseAuditToTransaction(transaction, {
      actorUserId: user.uid,
      actorName: user.name,
      actorEmail: user.email,
      actorRole: user.role,
      action: previousRecord ? "UA_MAINTENANCE_UPDATED" : "UA_MAINTENANCE_CREATED",
      entityType: "uaMaintenance",
      entityId: record.id,
      entityName: `${record.uaModel.trim()} - ${record.uaId.trim()}`,
      previousValue: previousRecord ? recordAuditValue(previousRecord) : null,
      updatedValue: recordAuditValue(savedRecord),
      details: {
        inspectionDate: record.inspectionDate,
        passCount,
        failCount
      }
    });
  });

  invalidateCaches();
  return savedRecord;
}

export async function deleteUaMaintenanceRecord(recordId: string) {
  const user = await requireFirebaseUser();
  const existingRecord = await fetchUaMaintenanceRecord(recordId);
  const cleanId = safeId(recordId);
  const entries = await getDocs(
    query(
      collection(firestore, "uaMaintenanceEntries"),
      where("recordId", "==", recordId)
    )
  );
  const operations: FirestoreOperation[] = entries.docs.map((item) => ({
    type: "delete",
    reference: item.ref
  }));
  operations.push(
    { type: "delete", reference: doc(firestore, "uaMaintenanceRecords", cleanId) },
    { type: "delete", reference: doc(firestore, "uaMaintenanceSignatures", cleanId) },
    {
      type: "set",
      reference: doc(firestore, "uaMaintenanceTombstones", cleanId),
      data: {
        recordId,
        uaModel: existingRecord.uaModel,
        uaId: existingRecord.uaId,
        deletedAt: Timestamp.now(),
        deletedByUid: user.uid,
        deletedByEmail: user.email || "",
        schemaVersion: 1
      }
    }
  );

  await commitOperations(operations);
  invalidateCaches();
  await writeFirebaseAudit({
    actorUserId: user.uid,
    actorName: user.name,
    actorEmail: user.email,
    actorRole: user.role,
    action: "UA_MAINTENANCE_DELETED",
    entityType: "uaMaintenance",
    entityId: recordId,
    entityName: `${existingRecord.uaModel} - ${existingRecord.uaId}`,
    previousValue: recordAuditValue(existingRecord),
    updatedValue: null,
    details: { inspectionDate: existingRecord.inspectionDate }
  });
  return { recordId };
}
