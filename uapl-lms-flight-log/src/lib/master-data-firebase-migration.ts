import {
  collection,
  doc,
  getDocs,
  Timestamp,
  writeBatch
} from "firebase/firestore";
import { firestore } from "@/lib/firebase-client";
import { postToGoogle } from "@/lib/google-api";
import type { MasterDataKey } from "@/lib/master-data";

const WRITE_BATCH_SIZE = 400;

export type MasterDataCatalogItem = {
  id: string;
  value: string;
  status: "active" | "inactive";
};

export type MasterDataCatalog = {
  sections: Record<MasterDataKey, MasterDataCatalogItem[]>;
};

export type MasterDataMigrationAnalysis = {
  catalog: MasterDataCatalog;
  totalItems: number;
  activeItems: number;
  inactiveItems: number;
  sectionCounts: Record<MasterDataKey, number>;
  duplicateValues: string[];
  emptyValues: string[];
};

export type MasterDataVerification = {
  verified: boolean;
  expectedCount: number;
  actualCount: number;
  mismatches: string[];
};

const sectionKeys: MasterDataKey[] = [
  "locations",
  "batterySerialNumbers",
  "afeInstructors",
  "uaModels",
  "uaCategories"
];

function safeDocumentId(section: MasterDataKey, id: string) {
  return `${section}__${id}`.replace(/\//g, "_");
}

function comparableItem(
  section: MasterDataKey,
  item: MasterDataCatalogItem,
  sortOrder: number
) {
  return {
    id: item.id,
    section,
    value: item.value.trim(),
    status: item.status === "inactive" ? "inactive" : "active",
    sortOrder
  };
}

export async function loadGoogleMasterDataCatalog() {
  const response = await postToGoogle<{
    catalog?: MasterDataCatalog;
  }>({
    action: "getMasterDataCatalog"
  });

  if (!response.catalog?.sections) {
    throw new Error("Google Sheets returned no Flight Log Master Data catalog.");
  }

  return response.catalog;
}

export function analyzeMasterDataMigration(
  catalog: MasterDataCatalog
): MasterDataMigrationAnalysis {
  const duplicateValues: string[] = [];
  const emptyValues: string[] = [];
  const sectionCounts = {} as Record<MasterDataKey, number>;
  let activeItems = 0;
  let inactiveItems = 0;

  sectionKeys.forEach((section) => {
    const items = Array.isArray(catalog.sections[section])
      ? catalog.sections[section]
      : [];
    const values = new Map<string, number>();
    sectionCounts[section] = items.length;

    items.forEach((item) => {
      const value = String(item.value || "").trim();
      const normalized = value.toLowerCase();

      if (!value) emptyValues.push(`${section}: ${item.id}`);
      if (normalized) values.set(normalized, (values.get(normalized) || 0) + 1);
      if (item.status === "inactive") inactiveItems += 1;
      else activeItems += 1;
    });

    values.forEach((count, value) => {
      if (count > 1) duplicateValues.push(`${section}: ${value}`);
    });
  });

  return {
    catalog,
    totalItems: activeItems + inactiveItems,
    activeItems,
    inactiveItems,
    sectionCounts,
    duplicateValues,
    emptyValues
  };
}

export async function migrateMasterDataToFirestore(
  analysis: MasterDataMigrationAnalysis,
  migratedBy: { uid: string; email: string }
) {
  if (analysis.duplicateValues.length || analysis.emptyValues.length) {
    throw new Error("Resolve invalid Master Data values before migration.");
  }

  const existingSnapshot = await getDocs(
    collection(firestore, "flightLogMasterData")
  );
  const operations: Array<{
    type: "set" | "delete";
    reference: ReturnType<typeof doc>;
    data?: Record<string, unknown>;
  }> = existingSnapshot.docs.map((snapshot) => ({
    type: "delete" as const,
    reference: snapshot.ref
  }));

  sectionKeys.forEach((section) => {
    analysis.catalog.sections[section].forEach((item, sortOrder) => {
      const comparable = comparableItem(section, item, sortOrder);
      operations.push({
        type: "set",
        reference: doc(
          firestore,
          "flightLogMasterData",
          safeDocumentId(section, item.id)
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

  for (let start = 0; start < operations.length; start += WRITE_BATCH_SIZE) {
    const batch = writeBatch(firestore);
    operations.slice(start, start + WRITE_BATCH_SIZE).forEach((operation) => {
      if (operation.type === "delete") batch.delete(operation.reference);
      else batch.set(operation.reference, operation.data || {});
    });
    await batch.commit();
  }

  const runId = `flight-master-data-${Date.now()}`;
  const runBatch = writeBatch(firestore);
  runBatch.set(doc(firestore, "migrationRuns", runId), {
    id: runId,
    type: "flight-master-data",
    itemCount: analysis.totalItems,
    activeItemCount: analysis.activeItems,
    inactiveItemCount: analysis.inactiveItems,
    migratedByUid: migratedBy.uid,
    migratedByEmail: migratedBy.email,
    completedAt: Timestamp.now(),
    source: "google-sheets"
  });
  await runBatch.commit();

  return { runId };
}

export async function verifyMasterDataMigration(
  analysis: MasterDataMigrationAnalysis
): Promise<MasterDataVerification> {
  const snapshot = await getDocs(collection(firestore, "flightLogMasterData"));
  const actualItems = new Map(
    snapshot.docs.map((item) => [item.id, item.data()])
  );
  const expectedIds = new Set<string>();
  const mismatches: string[] = [];

  sectionKeys.forEach((section) => {
    analysis.catalog.sections[section].forEach((item, sortOrder) => {
      const documentId = safeDocumentId(section, item.id);
      expectedIds.add(documentId);
      const expected = comparableItem(section, item, sortOrder);
      const actual = actualItems.get(documentId);

      if (!actual) {
        mismatches.push(`Missing ${section}: ${item.value}`);
        return;
      }

      const comparableActual = {
        id: actual.id,
        section: actual.section,
        value: actual.value,
        status: actual.status,
        sortOrder: actual.sortOrder
      };

      if (JSON.stringify(comparableActual) !== JSON.stringify(expected)) {
        mismatches.push(`Value differs in ${section}: ${item.value}`);
      }
    });
  });

  actualItems.forEach((_, id) => {
    if (!expectedIds.has(id)) mismatches.push(`Extra Master Data item: ${id}`);
  });

  return {
    verified:
      mismatches.length === 0 && expectedIds.size === actualItems.size,
    expectedCount: expectedIds.size,
    actualCount: actualItems.size,
    mismatches: mismatches.slice(0, 100)
  };
}
