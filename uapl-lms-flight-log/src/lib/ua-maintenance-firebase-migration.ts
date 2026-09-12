import {
  collection,
  doc,
  getDocs,
  Timestamp,
  writeBatch
} from "firebase/firestore";
import { firestore } from "@/lib/firebase-client";
import { googleAppsScriptUrl } from "@/lib/google-api";
import { sessionKey } from "@/lib/demo-auth";
import type { UaMaintenanceRecordsPage } from "@/lib/ua-maintenance-api";
import type {
  UaMaintenanceEntry,
  UaMaintenanceMasterData,
  UaMaintenanceMasterItem,
  UaMaintenanceMasterSection,
  UaMaintenanceRecord,
  UaMaintenanceRecordSummary
} from "@/lib/ua-maintenance";

const WRITE_BATCH_SIZE = 400;
const SOURCE_PAGE_SIZE = 25;
const DETAIL_CONCURRENCY = 2;
const MIGRATION_READ_TIMEOUT_MS = 90_000;
const MIGRATION_READ_ATTEMPTS = 3;

const masterSections: UaMaintenanceMasterSection[] = [
  "uaModels",
  "uaIds",
  "descriptions"
];

const migrationCollections = [
  "uaMaintenanceMasterData",
  "uaMaintenanceRecords",
  "uaMaintenanceEntries",
  "uaMaintenanceSignatures"
] as const;

export type UaMaintenanceMigrationSource = {
  masterData: UaMaintenanceMasterData;
  records: UaMaintenanceRecord[];
};

export type UaMaintenanceMigrationAnalysis = {
  source: UaMaintenanceMigrationSource;
  masterDataCount: number;
  sectionCounts: Record<UaMaintenanceMasterSection, number>;
  recordCount: number;
  entryCount: number;
  passCount: number;
  failCount: number;
  signatureCount: number;
  invalidItems: string[];
  duplicateItems: string[];
};

export type UaMaintenanceMigrationVerification = {
  verified: boolean;
  expected: Record<string, number>;
  actual: Record<string, number>;
  mismatches: string[];
};

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

function migrationSessionToken() {
  try {
    const rawSession = localStorage.getItem(sessionKey);
    if (!rawSession) return "";
    const session = JSON.parse(rawSession) as { sessionToken?: string };
    return text(session.sessionToken);
  } catch {
    return "";
  }
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function migrationGooglePost<T>(payload: Record<string, unknown>) {
  const sessionToken = migrationSessionToken();
  if (!sessionToken) {
    throw new Error(
      "Your normal application session has expired. Sign in again before migration."
    );
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= MIGRATION_READ_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      MIGRATION_READ_TIMEOUT_MS
    );

    try {
      const response = await fetch(googleAppsScriptUrl, {
        method: "POST",
        body: JSON.stringify({ ...payload, sessionToken }),
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Google Sheets returned HTTP ${response.status}.`);
      }

      const data = (await response.json()) as T & {
        ok?: boolean;
        success?: boolean;
        error?: string;
        message?: string;
      };

      if (data.ok === false || data.success === false) {
        throw new Error(
          data.error || data.message || "Google Sheets rejected the request."
        );
      }

      return data;
    } catch (error) {
      lastError = error;
      if (attempt < MIGRATION_READ_ATTEMPTS) {
        await wait(attempt * 1_500);
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }

  if (lastError instanceof DOMException && lastError.name === "AbortError") {
    throw new Error(
      "Google Sheets did not respond after three extended attempts. Wait one minute and retry."
    );
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to load Google Sheets for migration.");
}

function comparableMasterItem(
  section: UaMaintenanceMasterSection,
  item: UaMaintenanceMasterItem
) {
  return {
    id: text(item.id),
    section,
    value: text(item.value),
    linkedUaId: text(item.linkedUaId),
    sortOrder: Number(item.sortOrder) || 0,
    status: item.status === "inactive" ? "inactive" : "active"
  };
}

function comparableRecord(record: UaMaintenanceRecord) {
  return {
    id: text(record.id),
    uaModel: text(record.uaModel),
    uaId: text(record.uaId),
    inspectionDate: text(record.inspectionDate),
    recommendation: text(record.recommendation),
    checkedByName: text(record.checkedByName),
    checkedByIdNo: text(record.checkedByIdNo),
    createdAt: text(record.createdAt),
    updatedAt: text(record.updatedAt),
    passCount: record.items.filter((item) => item.status === "pass").length,
    failCount: record.items.filter((item) => item.status === "fail").length,
    totalCount: record.items.length
  };
}

function comparableEntry(recordId: string, item: UaMaintenanceEntry) {
  return {
    recordId: text(recordId),
    itemId: text(item.itemId),
    description: text(item.description),
    sortOrder: Number(item.sortOrder) || 0,
    status: item.status,
    remarks: text(item.remarks)
  };
}

async function loadAllSummaries() {
  const first = await migrationGooglePost<UaMaintenanceRecordsPage>({
    action: "getUaMaintenanceRecordsPage",
    page: 1,
    pageSize: SOURCE_PAGE_SIZE,
    query: "",
    year: "",
    month: ""
  });
  const summaries: UaMaintenanceRecordSummary[] = [...(first.records || [])];

  for (let page = 2; page <= first.totalPages; page += 1) {
    const result = await migrationGooglePost<UaMaintenanceRecordsPage>({
      action: "getUaMaintenanceRecordsPage",
      page,
      pageSize: SOURCE_PAGE_SIZE,
      query: "",
      year: "",
      month: ""
    });
    summaries.push(...(result.records || []));
  }

  return summaries;
}

async function loadRecordDetails(recordIds: string[]) {
  const records: UaMaintenanceRecord[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < recordIds.length) {
      const index = nextIndex;
      nextIndex += 1;
      const result = await migrationGooglePost<{ record: UaMaintenanceRecord }>({
        action: "getUaMaintenanceRecord",
        recordId: recordIds[index]
      });
      records[index] = result.record;
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(DETAIL_CONCURRENCY, recordIds.length) },
      () => worker()
    )
  );

  return records.filter(Boolean);
}

export async function loadGoogleUaMaintenanceSource() {
  const masterDataResult = await migrationGooglePost<{
    masterData: UaMaintenanceMasterData;
  }>({ action: "getUaMaintenanceMasterData" });
  const summaries = await loadAllSummaries();
  const records = await loadRecordDetails(
    summaries.map((record) => record.id).filter(Boolean)
  );

  return {
    masterData: masterDataResult.masterData,
    records
  } satisfies UaMaintenanceMigrationSource;
}

export function analyzeUaMaintenanceMigration(
  source: UaMaintenanceMigrationSource
): UaMaintenanceMigrationAnalysis {
  const invalidItems: string[] = [];
  const duplicateItems: string[] = [];
  const masterIds = new Set<string>();
  const recordIds = new Set<string>();
  const entryIds = new Set<string>();
  const sectionCounts = {} as Record<UaMaintenanceMasterSection, number>;
  let masterDataCount = 0;
  let entryCount = 0;
  let passCount = 0;
  let failCount = 0;
  let signatureCount = 0;

  masterSections.forEach((section) => {
    const items = Array.isArray(source.masterData[section])
      ? source.masterData[section]
      : [];
    sectionCounts[section] = items.length;
    masterDataCount += items.length;

    items.forEach((item, index) => {
      const documentId = masterDocumentId(section, item.id);
      if (!safeId(item.id) || !text(item.value).trim()) {
        invalidItems.push(`${section} item ${index + 1} has an empty ID or value.`);
      }
      if (masterIds.has(documentId)) duplicateItems.push(`Master Data: ${documentId}`);
      masterIds.add(documentId);
    });
  });

  source.records.forEach((record, recordIndex) => {
    const recordId = safeId(record.id);
    if (!recordId || !text(record.uaModel).trim() || !text(record.uaId).trim()) {
      invalidItems.push(`Record ${recordIndex + 1} has an empty ID, UA model, or UA ID.`);
    }
    if (recordIds.has(recordId)) duplicateItems.push(`Record ID: ${recordId}`);
    recordIds.add(recordId);
    if (record.signatureDataUrl) signatureCount += 1;

    record.items.forEach((item, itemIndex) => {
      entryCount += 1;
      if (item.status === "pass") passCount += 1;
      if (item.status === "fail") failCount += 1;
      const documentId = entryDocumentId(record.id, item.itemId);
      if (!safeId(item.itemId) || !text(item.description).trim()) {
        invalidItems.push(
          `${record.uaModel} ${record.uaId}: checklist item ${itemIndex + 1} has an empty ID or description.`
        );
      }
      if (entryIds.has(documentId)) duplicateItems.push(`Checklist item: ${documentId}`);
      entryIds.add(documentId);
    });
  });

  return {
    source,
    masterDataCount,
    sectionCounts,
    recordCount: source.records.length,
    entryCount,
    passCount,
    failCount,
    signatureCount,
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

export async function migrateUaMaintenanceToFirestore(
  analysis: UaMaintenanceMigrationAnalysis,
  migratedBy: { uid: string; email: string }
) {
  if (analysis.invalidItems.length || analysis.duplicateItems.length) {
    throw new Error("Resolve invalid or duplicate UA Maintenance data before migration.");
  }

  const operations: Array<{
    type: "set" | "delete";
    reference: ReturnType<typeof doc>;
    data?: Record<string, unknown>;
  }> = [];

  for (const collectionName of migrationCollections) {
    const snapshot = await getDocs(collection(firestore, collectionName));
    snapshot.docs.forEach((item) => {
      operations.push({ type: "delete", reference: item.ref });
    });
  }

  masterSections.forEach((section) => {
    analysis.source.masterData[section].forEach((item) => {
      const comparable = comparableMasterItem(section, item);
      operations.push({
        type: "set",
        reference: doc(
          firestore,
          "uaMaintenanceMasterData",
          masterDocumentId(section, item.id)
        ),
        data: {
          ...comparable,
          valueLower: comparable.value.toLowerCase(),
          migratedAt: Timestamp.now(),
          schemaVersion: 1
        }
      });
    });
  });

  analysis.source.records.forEach((record) => {
    operations.push({
      type: "set",
      reference: doc(firestore, "uaMaintenanceRecords", safeId(record.id)),
      data: {
        ...comparableRecord(record),
        uaModelLower: text(record.uaModel).toLowerCase(),
        uaIdLower: text(record.uaId).toLowerCase(),
        migratedAt: Timestamp.now(),
        schemaVersion: 1
      }
    });

    record.items.forEach((item) => {
      operations.push({
        type: "set",
        reference: doc(
          firestore,
          "uaMaintenanceEntries",
          entryDocumentId(record.id, item.itemId)
        ),
        data: {
          ...comparableEntry(record.id, item),
          migratedAt: Timestamp.now(),
          schemaVersion: 1
        }
      });
    });

    if (record.signatureDataUrl) {
      operations.push({
        type: "set",
        reference: doc(firestore, "uaMaintenanceSignatures", safeId(record.id)),
        data: {
          recordId: text(record.id),
          signatureDataUrl: text(record.signatureDataUrl),
          migratedAt: Timestamp.now(),
          schemaVersion: 1
        }
      });
    }
  });

  await commitOperations(operations);

  const runId = `ua-maintenance-${Date.now()}`;
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, "migrationRuns", runId), {
    id: runId,
    type: "ua-maintenance",
    masterDataCount: analysis.masterDataCount,
    recordCount: analysis.recordCount,
    entryCount: analysis.entryCount,
    signatureCount: analysis.signatureCount,
    migratedByUid: migratedBy.uid,
    migratedByEmail: migratedBy.email,
    completedAt: Timestamp.now(),
    source: "google-sheets"
  });
  await batch.commit();

  return { runId };
}

function pickComparable(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>
) {
  return Object.fromEntries(Object.keys(expected).map((key) => [key, actual[key]]));
}

export async function verifyUaMaintenanceMigration(
  analysis: UaMaintenanceMigrationAnalysis
): Promise<UaMaintenanceMigrationVerification> {
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

  masterSections.forEach((section) => {
    analysis.source.masterData[section].forEach((item) => {
      const actual = stores.uaMaintenanceMasterData.get(
        masterDocumentId(section, item.id)
      );
      const expected = comparableMasterItem(section, item);
      if (!actual) mismatches.push(`Missing ${section}: ${item.value}`);
      else if (JSON.stringify(pickComparable(actual, expected)) !== JSON.stringify(expected)) {
        mismatches.push(`Master Data differs: ${section} - ${item.value}`);
      }
    });
  });

  analysis.source.records.forEach((record) => {
    const actualRecord = stores.uaMaintenanceRecords.get(safeId(record.id));
    const expectedRecord = comparableRecord(record);
    if (!actualRecord) mismatches.push(`Missing record: ${record.uaModel} - ${record.uaId}`);
    else if (
      JSON.stringify(pickComparable(actualRecord, expectedRecord)) !==
      JSON.stringify(expectedRecord)
    ) mismatches.push(`Record differs: ${record.uaModel} - ${record.uaId}`);

    record.items.forEach((item) => {
      const actual = stores.uaMaintenanceEntries.get(
        entryDocumentId(record.id, item.itemId)
      );
      const expected = comparableEntry(record.id, item);
      if (!actual) mismatches.push(`Missing checklist item: ${record.uaId} - ${item.description}`);
      else if (JSON.stringify(pickComparable(actual, expected)) !== JSON.stringify(expected)) {
        mismatches.push(`Checklist item differs: ${record.uaId} - ${item.description}`);
      }
    });

    const signature = stores.uaMaintenanceSignatures.get(safeId(record.id));
    if (record.signatureDataUrl && signature?.signatureDataUrl !== record.signatureDataUrl) {
      mismatches.push(`Signature differs: ${record.uaModel} - ${record.uaId}`);
    }
    if (!record.signatureDataUrl && signature) {
      mismatches.push(`Unexpected signature: ${record.uaModel} - ${record.uaId}`);
    }
  });

  const expected = {
    masterData: analysis.masterDataCount,
    records: analysis.recordCount,
    entries: analysis.entryCount,
    signatures: analysis.signatureCount
  };
  const actual = {
    masterData: stores.uaMaintenanceMasterData.size,
    records: stores.uaMaintenanceRecords.size,
    entries: stores.uaMaintenanceEntries.size,
    signatures: stores.uaMaintenanceSignatures.size
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
