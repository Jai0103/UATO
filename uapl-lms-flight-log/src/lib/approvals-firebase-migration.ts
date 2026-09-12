import {
  collection,
  doc,
  getDocs,
  Timestamp,
  writeBatch
} from "firebase/firestore";
import type { ApprovalsPage } from "@/lib/approvals-api";
import type {
  ApprovalDocument,
  ApprovalLocation,
  ApprovalRecord
} from "@/lib/approvals";
import { sessionKey } from "@/lib/demo-auth";
import { firestore } from "@/lib/firebase-client";
import { googleAppsScriptUrl } from "@/lib/google-api";

const PAGE_SIZE = 25;
const DETAIL_CONCURRENCY = 2;
const WRITE_BATCH_SIZE = 400;
const READ_TIMEOUT_MS = 90_000;
const READ_ATTEMPTS = 3;

const migrationCollections = [
  "approvalRecords",
  "approvalLocations",
  "approvalDocuments"
] as const;

export type ApprovalsMigrationAnalysis = {
  records: ApprovalRecord[];
  recordCount: number;
  activeRecordCount: number;
  archivedRecordCount: number;
  locationCount: number;
  activeLocationCount: number;
  documentCount: number;
  currentDocumentCount: number;
  invalidItems: string[];
  duplicateItems: string[];
};

export type ApprovalsMigrationVerification = {
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

function locationDocumentId(approvalId: string, locationId: string) {
  return `${safeId(approvalId)}__${safeId(locationId)}`;
}

function documentDocumentId(approvalId: string, documentId: string) {
  return `${safeId(approvalId)}__${safeId(documentId)}`;
}

function comparableRecord(record: ApprovalRecord) {
  const activeLocations = record.locations.filter((location) => location.active);
  return {
    id: asText(record.id),
    approvalType: record.approvalType,
    approvalNumber: asText(record.approvalNumber),
    issuingAuthority: asText(record.issuingAuthority),
    effectiveDate: asText(record.effectiveDate),
    expiryDate: asText(record.expiryDate),
    responsiblePerson: asText(record.responsiblePerson),
    responsibleEmail: asText(record.responsibleEmail),
    renewalLeadDays: Number(record.renewalLeadDays) || 0,
    renewalStatus: record.renewalStatus,
    renewalSubmittedAt: asText(record.renewalSubmittedAt),
    renewalReference: asText(record.renewalReference),
    generalConditions: asText(record.generalConditions),
    remarks: asText(record.remarks),
    archived: Boolean(record.archived),
    version: Number(record.version) || 1,
    supersedesRecordId: asText(record.supersedesRecordId),
    createdAt: asText(record.createdAt),
    updatedAt: asText(record.updatedAt),
    locationCount: record.locations.length,
    activeLocationCount: activeLocations.length,
    permittedLocations: activeLocations
      .map((location) => asText(location.name).trim())
      .filter(Boolean),
    documentCount: record.documents.length,
    hasCurrentDocument: record.documents.some(
      (item) => item.status === "current" && Boolean(item.driveFileId)
    )
  };
}

function comparableLocation(approvalId: string, item: ApprovalLocation) {
  return {
    id: asText(item.id),
    approvalId: asText(approvalId),
    name: asText(item.name),
    code: asText(item.code),
    address: asText(item.address),
    coordinates: asText(item.coordinates),
    effectiveDate: asText(item.effectiveDate),
    expiryDate: asText(item.expiryDate),
    operationalLimitations: asText(item.operationalLimitations),
    remarks: asText(item.remarks),
    active: Boolean(item.active)
  };
}

function comparableDocument(approvalId: string, item: ApprovalDocument) {
  return {
    id: asText(item.id),
    approvalId: asText(approvalId || item.approvalId),
    locationId: asText(item.locationId),
    fileName: asText(item.fileName),
    mimeType: asText(item.mimeType),
    driveFileId: asText(item.driveFileId),
    driveUrl: asText(item.driveUrl),
    status: item.status,
    uploadedAt: asText(item.uploadedAt),
    uploadedByName: asText(item.uploadedByName),
    uploadedByEmail: asText(item.uploadedByEmail)
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
      if (!response.ok) throw new Error(`Google Sheets returned HTTP ${response.status}.`);
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

async function loadApprovalSummaries() {
  const request = {
    action: "getApprovalsPage",
    pageSize: PAGE_SIZE,
    search: "",
    approvalType: "",
    expiryStatus: "",
    includeArchived: true
  };
  const first = await migrationGooglePost<ApprovalsPage>({ ...request, page: 1 });
  const records = [...(first.records || [])];
  for (let page = 2; page <= first.totalPages; page += 1) {
    const result = await migrationGooglePost<ApprovalsPage>({ ...request, page });
    records.push(...(result.records || []));
  }
  return records;
}

async function loadApprovalDetails(recordIds: string[]) {
  const records: ApprovalRecord[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < recordIds.length) {
      const index = nextIndex;
      nextIndex += 1;
      const response = await migrationGooglePost<{ record: ApprovalRecord }>({
        action: "getApprovalRecord",
        approvalId: recordIds[index]
      });
      records[index] = response.record;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(DETAIL_CONCURRENCY, recordIds.length) }, () => worker())
  );
  return records.filter(Boolean);
}

export async function loadGoogleApprovalsSource() {
  const summaries = await loadApprovalSummaries();
  return loadApprovalDetails(summaries.map((record) => record.id).filter(Boolean));
}

export function analyzeApprovalsMigration(records: ApprovalRecord[]): ApprovalsMigrationAnalysis {
  const invalidItems: string[] = [];
  const duplicateItems: string[] = [];
  const recordIds = new Set<string>();
  const locationIds = new Set<string>();
  const documentIds = new Set<string>();
  let locationCount = 0;
  let activeLocationCount = 0;
  let documentCount = 0;
  let currentDocumentCount = 0;

  records.forEach((record, index) => {
    const recordId = safeId(record.id);
    if (!recordId || !asText(record.approvalNumber).trim()) {
      invalidItems.push(`Approval ${index + 1} has an empty ID or approval number.`);
    }
    if (recordIds.has(recordId)) duplicateItems.push(`Approval ID: ${recordId}`);
    recordIds.add(recordId);

    record.locations.forEach((location, locationIndex) => {
      locationCount += 1;
      if (location.active) activeLocationCount += 1;
      const id = locationDocumentId(record.id, location.id);
      if (!safeId(location.id) || !asText(location.name).trim()) {
        invalidItems.push(`${record.approvalNumber}: location ${locationIndex + 1} has an empty ID or name.`);
      }
      if (locationIds.has(id)) duplicateItems.push(`Approval location: ${id}`);
      locationIds.add(id);
    });

    record.documents.forEach((document, documentIndex) => {
      documentCount += 1;
      if (document.status === "current") currentDocumentCount += 1;
      const id = documentDocumentId(record.id, document.id);
      if (!safeId(document.id) || !asText(document.fileName).trim()) {
        invalidItems.push(`${record.approvalNumber}: document ${documentIndex + 1} has an empty ID or file name.`);
      }
      if (documentIds.has(id)) duplicateItems.push(`Approval document: ${id}`);
      documentIds.add(id);
    });
  });

  return {
    records,
    recordCount: records.length,
    activeRecordCount: records.filter((record) => !record.archived).length,
    archivedRecordCount: records.filter((record) => record.archived).length,
    locationCount,
    activeLocationCount,
    documentCount,
    currentDocumentCount,
    invalidItems,
    duplicateItems
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

export async function migrateApprovalsToFirestore(
  analysis: ApprovalsMigrationAnalysis,
  migratedBy: { uid: string; email: string }
) {
  if (analysis.invalidItems.length || analysis.duplicateItems.length) {
    throw new Error("Resolve invalid or duplicate approval data before migration.");
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

  analysis.records.forEach((record) => {
    operations.push({
      type: "set",
      reference: doc(firestore, "approvalRecords", safeId(record.id)),
      data: {
        ...comparableRecord(record),
        approvalNumberLower: asText(record.approvalNumber).toLowerCase(),
        migratedAt: Timestamp.now(),
        schemaVersion: 1
      }
    });
    record.locations.forEach((location) => {
      operations.push({
        type: "set",
        reference: doc(
          firestore,
          "approvalLocations",
          locationDocumentId(record.id, location.id)
        ),
        data: {
          ...comparableLocation(record.id, location),
          nameLower: asText(location.name).toLowerCase(),
          migratedAt: Timestamp.now(),
          schemaVersion: 1
        }
      });
    });
    record.documents.forEach((document) => {
      operations.push({
        type: "set",
        reference: doc(
          firestore,
          "approvalDocuments",
          documentDocumentId(record.id, document.id)
        ),
        data: {
          ...comparableDocument(record.id, document),
          sourceSystem: "google-drive",
          migratedAt: Timestamp.now(),
          schemaVersion: 1
        }
      });
    });
  });

  await commitOperations(operations);
  const runId = `approvals-${Date.now()}`;
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, "migrationRuns", runId), {
    id: runId,
    type: "approvals",
    recordCount: analysis.recordCount,
    locationCount: analysis.locationCount,
    documentCount: analysis.documentCount,
    migratedByUid: migratedBy.uid,
    migratedByEmail: migratedBy.email,
    completedAt: Timestamp.now(),
    source: "google-sheets-and-drive"
  });
  await batch.commit();
  return { runId };
}

function pick(actual: Record<string, unknown>, expected: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(expected).map((key) => [key, actual[key]]));
}

export async function verifyApprovalsMigration(
  analysis: ApprovalsMigrationAnalysis
): Promise<ApprovalsMigrationVerification> {
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

  analysis.records.forEach((record) => {
    const expectedRecord = comparableRecord(record);
    const actualRecord = stores.approvalRecords.get(safeId(record.id));
    if (!actualRecord) mismatches.push(`Missing approval: ${record.approvalNumber}`);
    else if (JSON.stringify(pick(actualRecord, expectedRecord)) !== JSON.stringify(expectedRecord)) {
      mismatches.push(`Approval differs: ${record.approvalNumber}`);
    }

    record.locations.forEach((location) => {
      const expected = comparableLocation(record.id, location);
      const actual = stores.approvalLocations.get(locationDocumentId(record.id, location.id));
      if (!actual) mismatches.push(`Missing location: ${record.approvalNumber} - ${location.name}`);
      else if (JSON.stringify(pick(actual, expected)) !== JSON.stringify(expected)) {
        mismatches.push(`Location differs: ${record.approvalNumber} - ${location.name}`);
      }
    });

    record.documents.forEach((document) => {
      const expected = comparableDocument(record.id, document);
      const actual = stores.approvalDocuments.get(documentDocumentId(record.id, document.id));
      if (!actual) mismatches.push(`Missing document: ${record.approvalNumber} - ${document.fileName}`);
      else if (JSON.stringify(pick(actual, expected)) !== JSON.stringify(expected)) {
        mismatches.push(`Document differs: ${record.approvalNumber} - ${document.fileName}`);
      }
    });
  });

  const expected = {
    approvals: analysis.recordCount,
    locations: analysis.locationCount,
    documents: analysis.documentCount
  };
  const actual = {
    approvals: stores.approvalRecords.size,
    locations: stores.approvalLocations.size,
    documents: stores.approvalDocuments.size
  };
  Object.keys(expected).forEach((key) => {
    const countKey = key as keyof typeof expected;
    if (expected[countKey] !== actual[countKey]) {
      mismatches.push(`${key} count differs: ${actual[countKey]} / ${expected[countKey]}`);
    }
  });

  return {
    verified: mismatches.length === 0,
    expected,
    actual,
    mismatches: mismatches.slice(0, 100)
  };
}
