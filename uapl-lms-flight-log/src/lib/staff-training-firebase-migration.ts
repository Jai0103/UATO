import {
  collection,
  doc,
  getDocs,
  Timestamp,
  writeBatch
} from "firebase/firestore";
import { firestore } from "@/lib/firebase-client";
import {
  fetchStaffTrainingDescriptions,
  fetchStaffTrainingRecord,
  fetchStaffTrainingRecords
} from "@/lib/staff-training-api";
import type {
  StaffTrainingDescription,
  StaffTrainingEntry,
  StaffTrainingRecord
} from "@/lib/staff-training";

const WRITE_BATCH_SIZE = 400;
const DETAIL_CONCURRENCY = 3;

const migrationCollections = [
  "staffTrainingDescriptions",
  "staffTrainingRecords",
  "staffTrainingEntries",
  "staffTrainingSignatures"
] as const;

export type StaffTrainingMigrationSource = {
  descriptions: StaffTrainingDescription[];
  records: StaffTrainingRecord[];
};

export type StaffTrainingMigrationAnalysis = {
  source: StaffTrainingMigrationSource;
  descriptionCount: number;
  recordCount: number;
  entryCount: number;
  signatureCount: number;
  completedEntryCount: number;
  invalidItems: string[];
  duplicateItems: string[];
};

export type StaffTrainingMigrationVerification = {
  verified: boolean;
  expected: Record<string, number>;
  actual: Record<string, number>;
  mismatches: string[];
};

function safeId(value: string) {
  return String(value || "").trim().replace(/\//g, "_");
}

function entryDocumentId(recordId: string, itemId: string) {
  return `${safeId(recordId)}__${safeId(itemId)}`;
}

function comparableDescription(item: StaffTrainingDescription) {
  return {
    id: item.id,
    trainingType: item.trainingType,
    description: item.description,
    sortOrder: Number(item.sortOrder) || 0,
    status: item.status === "inactive" ? "inactive" : "active"
  };
}

function comparableRecord(record: StaffTrainingRecord) {
  return {
    id: record.id,
    staffName: record.staffName,
    staffEmail: record.staffEmail,
    designation: record.designation,
    headOfTrainingName: record.headOfTrainingName,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedCount: record.items.filter((item) => item.status === "completed").length,
    totalCount: record.items.length
  };
}

function comparableEntry(recordId: string, item: StaffTrainingEntry) {
  return {
    recordId,
    itemId: item.itemId,
    trainingType: item.trainingType,
    description: item.description,
    sortOrder: Number(item.sortOrder) || 0,
    status: item.status,
    dateCompleted: item.dateCompleted,
    remarks: item.remarks
  };
}

async function loadRecordDetails(recordIds: string[]) {
  const records: StaffTrainingRecord[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < recordIds.length) {
      const index = nextIndex;
      nextIndex += 1;
      records[index] = await fetchStaffTrainingRecord(recordIds[index]);
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

export async function loadGoogleStaffTrainingSource() {
  const [descriptions, summaries] = await Promise.all([
    fetchStaffTrainingDescriptions(),
    fetchStaffTrainingRecords()
  ]);
  const records = await loadRecordDetails(
    summaries.map((record) => record.id).filter(Boolean)
  );

  return { descriptions, records } satisfies StaffTrainingMigrationSource;
}

export function analyzeStaffTrainingMigration(
  source: StaffTrainingMigrationSource
): StaffTrainingMigrationAnalysis {
  const invalidItems: string[] = [];
  const duplicateItems: string[] = [];
  const descriptionIds = new Set<string>();
  const recordIds = new Set<string>();
  const entryIds = new Set<string>();
  let entryCount = 0;
  let signatureCount = 0;
  let completedEntryCount = 0;

  source.descriptions.forEach((item, index) => {
    const id = safeId(item.id);
    if (!id || !item.description.trim()) {
      invalidItems.push(`Description ${index + 1} has an empty ID or value.`);
    }
    if (descriptionIds.has(id)) duplicateItems.push(`Description ID: ${id}`);
    descriptionIds.add(id);
  });

  source.records.forEach((record, recordIndex) => {
    const recordId = safeId(record.id);
    if (!recordId || !record.staffName.trim()) {
      invalidItems.push(`Record ${recordIndex + 1} has an empty ID or staff name.`);
    }
    if (recordIds.has(recordId)) duplicateItems.push(`Record ID: ${recordId}`);
    recordIds.add(recordId);
    if (record.signatureDataUrl) signatureCount += 1;

    record.items.forEach((item, itemIndex) => {
      entryCount += 1;
      if (item.status === "completed") completedEntryCount += 1;
      const documentId = entryDocumentId(record.id, item.itemId);
      if (!safeId(item.itemId) || !item.description.trim()) {
        invalidItems.push(
          `${record.staffName}: checklist item ${itemIndex + 1} has an empty ID or description.`
        );
      }
      if (entryIds.has(documentId)) duplicateItems.push(`Checklist item: ${documentId}`);
      entryIds.add(documentId);
    });
  });

  return {
    source,
    descriptionCount: source.descriptions.length,
    recordCount: source.records.length,
    entryCount,
    signatureCount,
    completedEntryCount,
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

export async function migrateStaffTrainingToFirestore(
  analysis: StaffTrainingMigrationAnalysis,
  migratedBy: { uid: string; email: string }
) {
  if (analysis.invalidItems.length || analysis.duplicateItems.length) {
    throw new Error("Resolve invalid or duplicate Staff Training data before migration.");
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

  analysis.source.descriptions.forEach((item) => {
    const comparable = comparableDescription(item);
    operations.push({
      type: "set",
      reference: doc(firestore, "staffTrainingDescriptions", safeId(item.id)),
      data: {
        ...comparable,
        descriptionLower: comparable.description.toLowerCase(),
        migratedAt: Timestamp.now(),
        schemaVersion: 1
      }
    });
  });

  analysis.source.records.forEach((record) => {
    operations.push({
      type: "set",
      reference: doc(firestore, "staffTrainingRecords", safeId(record.id)),
      data: {
        ...comparableRecord(record),
        staffNameLower: record.staffName.toLowerCase(),
        migratedAt: Timestamp.now(),
        schemaVersion: 1
      }
    });

    record.items.forEach((item) => {
      operations.push({
        type: "set",
        reference: doc(
          firestore,
          "staffTrainingEntries",
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
        reference: doc(firestore, "staffTrainingSignatures", safeId(record.id)),
        data: {
          recordId: record.id,
          signatureDataUrl: record.signatureDataUrl,
          migratedAt: Timestamp.now(),
          schemaVersion: 1
        }
      });
    }
  });

  await commitOperations(operations);

  const runId = `staff-training-${Date.now()}`;
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, "migrationRuns", runId), {
    id: runId,
    type: "staff-training",
    descriptionCount: analysis.descriptionCount,
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

export async function verifyStaffTrainingMigration(
  analysis: StaffTrainingMigrationAnalysis
): Promise<StaffTrainingMigrationVerification> {
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

  analysis.source.descriptions.forEach((item) => {
    const actual = stores.staffTrainingDescriptions.get(safeId(item.id));
    const expected = comparableDescription(item);
    if (!actual) mismatches.push(`Missing description: ${item.description}`);
    else if (
      JSON.stringify(Object.fromEntries(Object.keys(expected).map((key) => [key, actual[key]]))) !==
      JSON.stringify(expected)
    ) mismatches.push(`Description differs: ${item.description}`);
  });

  analysis.source.records.forEach((record) => {
    const actualRecord = stores.staffTrainingRecords.get(safeId(record.id));
    const expectedRecord = comparableRecord(record);
    if (!actualRecord) mismatches.push(`Missing record: ${record.staffName}`);
    else if (
      JSON.stringify(Object.fromEntries(Object.keys(expectedRecord).map((key) => [key, actualRecord[key]]))) !==
      JSON.stringify(expectedRecord)
    ) mismatches.push(`Record differs: ${record.staffName}`);

    record.items.forEach((item) => {
      const actual = stores.staffTrainingEntries.get(
        entryDocumentId(record.id, item.itemId)
      );
      const expected = comparableEntry(record.id, item);
      if (!actual) mismatches.push(`Missing checklist item: ${record.staffName} - ${item.description}`);
      else if (
        JSON.stringify(Object.fromEntries(Object.keys(expected).map((key) => [key, actual[key]]))) !==
        JSON.stringify(expected)
      ) mismatches.push(`Checklist item differs: ${record.staffName} - ${item.description}`);
    });

    const actualSignature = stores.staffTrainingSignatures.get(safeId(record.id));
    if (record.signatureDataUrl && actualSignature?.signatureDataUrl !== record.signatureDataUrl) {
      mismatches.push(`Signature differs: ${record.staffName}`);
    }
    if (!record.signatureDataUrl && actualSignature) {
      mismatches.push(`Unexpected signature: ${record.staffName}`);
    }
  });

  const expected = {
    descriptions: analysis.descriptionCount,
    records: analysis.recordCount,
    entries: analysis.entryCount,
    signatures: analysis.signatureCount
  };
  const actual = {
    descriptions: stores.staffTrainingDescriptions.size,
    records: stores.staffTrainingRecords.size,
    entries: stores.staffTrainingEntries.size,
    signatures: stores.staffTrainingSignatures.size
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
