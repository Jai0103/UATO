import {
  collection,
  doc,
  getDocs,
  Timestamp,
  writeBatch
} from "firebase/firestore";
import type {
  AuditHistoryResponse,
  AuditRecord,
  AuditValue
} from "@/lib/audit-api";
import { sessionKey } from "@/lib/demo-auth";
import { firestore } from "@/lib/firebase-client";
import { googleAppsScriptUrl } from "@/lib/google-api";

const PAGE_SIZE = 25;
const DETAIL_CONCURRENCY = 2;
const WRITE_BATCH_SIZE = 400;
const READ_TIMEOUT_MS = 90_000;
const READ_ATTEMPTS = 3;
const MAX_DETAIL_BYTES = 750_000;

const migrationCollections = [
  "auditEvents",
  "auditEventDetails"
] as const;

export type AuditMigrationProgress = {
  current: number;
  total: number;
  label: string;
};

export type AuditHistoryMigrationAnalysis = {
  records: AuditRecord[];
  eventCount: number;
  detailCount: number;
  actorCount: number;
  actionCount: number;
  entityTypeCount: number;
  invalidItems: string[];
  duplicateItems: string[];
  oversizedDetails: string[];
};

export type AuditHistoryMigrationVerification = {
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

function normalizedValue(value: AuditValue): AuditValue {
  if (value === undefined) return null;
  return value;
}

function detailPayload(record: AuditRecord) {
  return {
    auditId: asText(record.id),
    previousValue: normalizedValue(record.previousValue),
    updatedValue: normalizedValue(record.updatedValue),
    details: normalizedValue(record.details)
  };
}

function detailSize(record: AuditRecord) {
  return new TextEncoder().encode(JSON.stringify(detailPayload(record))).byteLength;
}

function comparableEvent(record: AuditRecord) {
  return {
    id: asText(record.id),
    timestamp: asText(record.timestamp),
    actorUserId: asText(record.actorUserId),
    actorName: asText(record.actorName),
    actorEmail: asText(record.actorEmail),
    actorRole: asText(record.actorRole),
    action: asText(record.action),
    entityType: asText(record.entityType),
    entityId: asText(record.entityId),
    entityName: asText(record.entityName),
    detailsAvailable: true
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
      if (!response.ok) {
        throw new Error("Google Sheets returned HTTP " + response.status + ".");
      }
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
  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to load Google Sheets for migration.");
}

async function loadSummaries() {
  const request = {
    action: "getAuditHistoryPage",
    pageSize: PAGE_SIZE,
    query: "",
    auditAction: "",
    entityType: "",
    dateFrom: "",
    dateTo: ""
  };
  const first = await migrationGooglePost<AuditHistoryResponse>({
    ...request,
    page: 1
  });
  const records = [...(first.records || [])];
  for (let page = 2; page <= first.totalPages; page += 1) {
    const result = await migrationGooglePost<AuditHistoryResponse>({
      ...request,
      page
    });
    records.push(...(result.records || []));
  }
  return records;
}

async function loadDetails(
  recordIds: string[],
  onProgress?: (progress: AuditMigrationProgress) => void
) {
  const records: AuditRecord[] = [];
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (nextIndex < recordIds.length) {
      const index = nextIndex;
      nextIndex += 1;
      const response = await migrationGooglePost<{ record: AuditRecord }>({
        action: "getAuditHistoryDetail",
        auditId: recordIds[index],
        // Apps Script currently includes recordId, but not auditId, in the
        // performance-cache key. Supplying both keeps each detail request unique.
        recordId: recordIds[index]
      });
      if (!response.record || response.record.detailsLoaded !== true) {
        throw new Error(
          "Audit detail " + recordIds[index] + " was not returned by the current Apps Script deployment."
        );
      }
      if (asText(response.record.id) !== asText(recordIds[index])) {
        throw new Error(
          "Google returned the wrong cached Audit History detail. Expected " +
            recordIds[index] +
            " but received " +
            asText(response.record.id) +
            "."
        );
      }
      records[index] = response.record;
      completed += 1;
      onProgress?.({
        current: completed,
        total: recordIds.length,
        label: "Loading audit details"
      });
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

export async function loadGoogleAuditHistorySource(
  onProgress?: (progress: AuditMigrationProgress) => void
) {
  onProgress?.({ current: 0, total: 0, label: "Loading audit index" });
  const summaries = await loadSummaries();
  onProgress?.({
    current: 0,
    total: summaries.length,
    label: "Loading audit details"
  });
  return loadDetails(
    summaries.map((record) => record.id).filter(Boolean),
    onProgress
  );
}

export function analyzeAuditHistoryMigration(
  records: AuditRecord[]
): AuditHistoryMigrationAnalysis {
  const invalidItems: string[] = [];
  const duplicateIds = new Set<string>();
  const oversizedDetails: string[] = [];
  const ids = new Set<string>();
  const actors = new Set<string>();
  const actions = new Set<string>();
  const entityTypes = new Set<string>();

  records.forEach((record, index) => {
    const id = safeId(record.id);
    if (!id || !asText(record.timestamp).trim() || !asText(record.action).trim()) {
      invalidItems.push("Audit event " + (index + 1) + " has an empty ID, timestamp, or action.");
    }
    if (ids.has(id)) duplicateIds.add("Audit ID: " + id);
    ids.add(id);
    actors.add(
      asText(record.actorEmail || record.actorUserId || record.actorName)
        .trim()
        .toLowerCase()
    );
    actions.add(asText(record.action).trim().toLowerCase());
    entityTypes.add(asText(record.entityType).trim().toLowerCase());
    if (detailSize(record) > MAX_DETAIL_BYTES) {
      oversizedDetails.push(
        asText(record.action) + " - " + asText(record.entityName || record.id)
      );
    }
  });

  actors.delete("");
  actions.delete("");
  entityTypes.delete("");

  return {
    records,
    eventCount: records.length,
    detailCount: records.length,
    actorCount: actors.size,
    actionCount: actions.size,
    entityTypeCount: entityTypes.size,
    invalidItems,
    duplicateItems: Array.from(duplicateIds),
    oversizedDetails
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

export async function migrateAuditHistoryToFirestore(
  analysis: AuditHistoryMigrationAnalysis,
  migratedBy: { uid: string; email: string }
) {
  if (
    analysis.invalidItems.length ||
    analysis.duplicateItems.length ||
    analysis.oversizedDetails.length
  ) {
    throw new Error("Resolve invalid, duplicate, or oversized Audit History data before migration.");
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

  analysis.records.forEach((record) => {
    const id = safeId(record.id);
    operations.push({
      type: "set",
      reference: doc(firestore, "auditEvents", id),
      data: {
        ...comparableEvent(record),
        actorNameLower: asText(record.actorName).toLowerCase(),
        entityNameLower: asText(record.entityName).toLowerCase(),
        migratedAt: Timestamp.now(),
        schemaVersion: 1
      }
    });
    operations.push({
      type: "set",
      reference: doc(firestore, "auditEventDetails", id),
      data: {
        ...detailPayload(record),
        migratedAt: Timestamp.now(),
        schemaVersion: 1
      }
    });
  });

  await commitOperations(operations);
  const runId = "audit-history-" + Date.now();
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, "migrationRuns", runId), {
    id: runId,
    type: "audit-history",
    eventCount: analysis.eventCount,
    detailCount: analysis.detailCount,
    migratedByUid: migratedBy.uid,
    migratedByEmail: migratedBy.email,
    completedAt: Timestamp.now(),
    source: "google-sheets"
  });
  await batch.commit();
  return { runId };
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stableSerialize).join(",") + "]";
  }
  const object = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(object)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + stableSerialize(object[key]))
      .join(",") +
    "}"
  );
}

function pick(actual: Record<string, unknown>, expected: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(expected).map((key) => [key, actual[key]]));
}

export async function verifyAuditHistoryMigration(
  analysis: AuditHistoryMigrationAnalysis
): Promise<AuditHistoryMigrationVerification> {
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
    const id = safeId(record.id);
    const expectedEvent = comparableEvent(record);
    const actualEvent = stores.auditEvents.get(id);
    if (!actualEvent) {
      mismatches.push("Missing audit event: " + record.id);
    } else if (
      stableSerialize(pick(actualEvent, expectedEvent)) !==
      stableSerialize(expectedEvent)
    ) {
      mismatches.push("Audit event differs: " + record.id);
    }

    const expectedDetail = detailPayload(record);
    const actualDetail = stores.auditEventDetails.get(id);
    if (!actualDetail) {
      mismatches.push("Missing audit detail: " + record.id);
    } else if (
      stableSerialize(pick(actualDetail, expectedDetail)) !==
      stableSerialize(expectedDetail)
    ) {
      mismatches.push("Audit detail differs: " + record.id);
    }
  });

  const expected = {
    events: analysis.eventCount,
    details: analysis.detailCount
  };
  const actual = {
    events: stores.auditEvents.size,
    details: stores.auditEventDetails.size
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
