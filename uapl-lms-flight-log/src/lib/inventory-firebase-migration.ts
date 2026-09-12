import {
  collection,
  doc,
  getDocs,
  Timestamp,
  writeBatch
} from "firebase/firestore";
import { sessionKey } from "@/lib/demo-auth";
import { firestore } from "@/lib/firebase-client";
import { googleAppsScriptUrl } from "@/lib/google-api";
import type { InventoryAssetsPage } from "@/lib/inventory-api";
import type {
  InventoryAsset,
  InventoryAssetDetail,
  InventoryMaintenance,
  InventoryMasterData,
  InventoryMasterItem,
  InventoryMasterSection,
  InventoryTransaction
} from "@/lib/inventory";

const PAGE_SIZE = 25;
const DETAIL_CONCURRENCY = 2;
const WRITE_BATCH_SIZE = 400;
const READ_TIMEOUT_MS = 90_000;
const READ_ATTEMPTS = 3;

const masterSections: InventoryMasterSection[] = [
  "equipmentTypes",
  "storageLocations",
  "conditions"
];

const migrationCollections = [
  "inventoryMasterData",
  "inventoryAssets",
  "inventoryTransactions",
  "inventoryMaintenance",
  "inventoryMediaReferences"
] as const;

type InventorySourceAsset = InventoryAssetDetail & { hasPhoto: boolean };

export type InventoryMigrationSource = {
  masterData: InventoryMasterData;
  assets: InventorySourceAsset[];
};

export type InventoryMigrationAnalysis = {
  source: InventoryMigrationSource;
  masterDataCount: number;
  sectionCounts: Record<InventoryMasterSection, number>;
  assetCount: number;
  activeAssetCount: number;
  transactionCount: number;
  maintenanceCount: number;
  photoCount: number;
  documentCount: number;
  embeddedMediaCount: number;
  invalidItems: string[];
  duplicateItems: string[];
};

export type InventoryMigrationVerification = {
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

function masterId(section: InventoryMasterSection, id: string) {
  return `${section}__${safeId(id)}`;
}

function externalUrl(value: string) {
  return /^https?:\/\//i.test(value.trim()) ? value.trim() : "";
}

function isEmbedded(value: string) {
  return /^data:/i.test(value.trim());
}

function comparableMaster(section: InventoryMasterSection, item: InventoryMasterItem) {
  return {
    id: asText(item.id),
    section,
    value: asText(item.value),
    sortOrder: Number(item.sortOrder) || 0,
    status: item.status === "inactive" ? "inactive" : "active"
  };
}

function comparableAsset(asset: InventoryAsset, hasPhoto: boolean) {
  return {
    id: asText(asset.id),
    assetTag: asText(asset.assetTag),
    equipmentType: asText(asset.equipmentType),
    brand: asText(asset.brand),
    model: asText(asset.model),
    serialNumber: asText(asset.serialNumber),
    uaRegistrationId: asText(asset.uaRegistrationId),
    description: asText(asset.description),
    quantity: Number(asset.quantity) || 0,
    storageLocation: asText(asset.storageLocation),
    storageDetail: asText(asset.storageDetail),
    operationalStatus: asset.operationalStatus,
    availabilityStatus: asset.availabilityStatus,
    condition: asText(asset.condition),
    assignedTo: asText(asset.assignedTo),
    dateAdded: asText(asset.dateAdded),
    active: Boolean(asset.active),
    batteryChemistry: asText(asset.batteryChemistry),
    batteryCapacityMah: asText(asset.batteryCapacityMah),
    batteryCellCount: asText(asset.batteryCellCount),
    batteryCycleCount: Number(asset.batteryCycleCount) || 0,
    batteryMaxCycles: Number(asset.batteryMaxCycles) || 0,
    batteryHealthPercent: Number(asset.batteryHealthPercent) || 0,
    lastInspectionDate: asText(asset.lastInspectionDate),
    nextInspectionDue: asText(asset.nextInspectionDue),
    remarks: asText(asset.remarks),
    createdAt: asText(asset.createdAt),
    updatedAt: asText(asset.updatedAt),
    hasPhoto
  };
}

function comparableTransaction(item: InventoryTransaction) {
  return {
    id: asText(item.id),
    assetId: asText(item.assetId),
    assetTag: asText(item.assetTag),
    action: item.action,
    issuedTo: asText(item.issuedTo),
    activity: asText(item.activity),
    fromLocation: asText(item.fromLocation),
    toLocation: asText(item.toLocation),
    checkoutAt: asText(item.checkoutAt),
    expectedReturnAt: asText(item.expectedReturnAt),
    returnedAt: asText(item.returnedAt),
    conditionBefore: asText(item.conditionBefore),
    conditionAfter: asText(item.conditionAfter),
    performedByName: asText(item.performedByName),
    performedByEmail: asText(item.performedByEmail),
    remarks: asText(item.remarks),
    createdAt: asText(item.createdAt)
  };
}

function comparableMaintenance(item: InventoryMaintenance) {
  return {
    id: asText(item.id),
    assetId: asText(item.assetId),
    assetTag: asText(item.assetTag),
    type: item.type,
    reportedDate: asText(item.reportedDate),
    completedDate: asText(item.completedDate),
    status: item.status,
    defectDescription: asText(item.defectDescription),
    correctiveAction: asText(item.correctiveAction),
    inspectedBy: asText(item.inspectedBy),
    performedBy: asText(item.performedBy),
    returnToServiceDate: asText(item.returnToServiceDate),
    documentName: asText(item.documentName),
    hasDocument: Boolean(item.documentDataUrl || item.documentName),
    remarks: asText(item.remarks),
    createdAt: asText(item.createdAt),
    updatedAt: asText(item.updatedAt)
  };
}

function photoReference(source: InventorySourceAsset) {
  return {
    id: `${safeId(source.asset.id)}__photo`,
    assetId: asText(source.asset.id),
    relatedId: asText(source.asset.id),
    kind: "asset-photo",
    fileName: "",
    externalUrl: externalUrl(source.asset.photoDataUrl),
    hasSourceFile: source.hasPhoto,
    embeddedPayloadOmitted: isEmbedded(source.asset.photoDataUrl),
    sourceSystem: "google-apps-script"
  };
}

function documentReference(item: InventoryMaintenance) {
  return {
    id: `${safeId(item.id)}__document`,
    assetId: asText(item.assetId),
    relatedId: asText(item.id),
    kind: "maintenance-document",
    fileName: asText(item.documentName),
    externalUrl: externalUrl(item.documentDataUrl),
    hasSourceFile: Boolean(item.documentDataUrl || item.documentName),
    embeddedPayloadOmitted: isEmbedded(item.documentDataUrl),
    sourceSystem: "google-apps-script"
  };
}

function sessionToken() {
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
  const token = sessionToken();
  if (!token) {
    throw new Error("Your normal application session has expired. Sign in again before migration.");
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
    try {
      const response = await fetch(googleAppsScriptUrl, {
        method: "POST",
        body: JSON.stringify({ ...payload, sessionToken: token }),
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

async function loadSummaries() {
  const request = {
    action: "getInventoryAssetsPage",
    pageSize: PAGE_SIZE,
    query: "",
    equipmentType: "",
    storageLocation: "",
    operationalStatus: "",
    availabilityStatus: "",
    condition: "",
    includeArchived: true
  };
  const first = await migrationGooglePost<InventoryAssetsPage>({ ...request, page: 1 });
  const assets = [...(first.assets || [])];
  for (let page = 2; page <= first.totalPages; page += 1) {
    const result = await migrationGooglePost<InventoryAssetsPage>({ ...request, page });
    assets.push(...(result.assets || []));
  }
  return assets;
}

async function loadAssetDetails(
  summaries: Awaited<ReturnType<typeof loadSummaries>>
) {
  const results: InventorySourceAsset[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < summaries.length) {
      const index = nextIndex;
      nextIndex += 1;
      const summary = summaries[index];
      const response = await migrationGooglePost<{ detail: InventoryAssetDetail }>({
        action: "getInventoryAsset",
        assetId: summary.id
      });
      results[index] = { ...response.detail, hasPhoto: Boolean(summary.hasPhoto) };
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(DETAIL_CONCURRENCY, summaries.length) }, () => worker())
  );
  return results.filter(Boolean);
}

export async function loadGoogleInventorySource() {
  const masterResponse = await migrationGooglePost<{ masterData: InventoryMasterData }>({
    action: "getInventoryMasterData"
  });
  const summaries = await loadSummaries();
  const assets = await loadAssetDetails(summaries);
  return { masterData: masterResponse.masterData, assets } satisfies InventoryMigrationSource;
}

export function analyzeInventoryMigration(
  source: InventoryMigrationSource
): InventoryMigrationAnalysis {
  const invalidItems: string[] = [];
  const duplicateItems: string[] = [];
  const masterIds = new Set<string>();
  const assetIds = new Set<string>();
  const assetTags = new Set<string>();
  const transactionIds = new Set<string>();
  const maintenanceIds = new Set<string>();
  const sectionCounts = {} as Record<InventoryMasterSection, number>;
  let masterDataCount = 0;
  let transactionCount = 0;
  let maintenanceCount = 0;
  let photoCount = 0;
  let documentCount = 0;
  let embeddedMediaCount = 0;

  masterSections.forEach((section) => {
    const items = source.masterData[section] || [];
    sectionCounts[section] = items.length;
    masterDataCount += items.length;
    items.forEach((item, index) => {
      const id = masterId(section, item.id);
      if (!safeId(item.id) || !asText(item.value).trim()) {
        invalidItems.push(`${section} item ${index + 1} has an empty ID or value.`);
      }
      if (masterIds.has(id)) duplicateItems.push(`Master Data: ${id}`);
      masterIds.add(id);
    });
  });

  source.assets.forEach((sourceAsset, index) => {
    const asset = sourceAsset.asset;
    const id = safeId(asset.id);
    const tag = asText(asset.assetTag).trim().toLowerCase();
    if (!id || !tag) invalidItems.push(`Asset ${index + 1} has an empty ID or asset tag.`);
    if (assetIds.has(id)) duplicateItems.push(`Asset ID: ${id}`);
    if (assetTags.has(tag)) duplicateItems.push(`Asset tag: ${asset.assetTag}`);
    assetIds.add(id);
    assetTags.add(tag);
    if (sourceAsset.hasPhoto) photoCount += 1;
    if (isEmbedded(asset.photoDataUrl)) embeddedMediaCount += 1;

    sourceAsset.transactions.forEach((item) => {
      transactionCount += 1;
      const transactionId = safeId(item.id);
      if (!transactionId) invalidItems.push(`${asset.assetTag}: transaction has an empty ID.`);
      if (transactionIds.has(transactionId)) duplicateItems.push(`Transaction ID: ${transactionId}`);
      transactionIds.add(transactionId);
    });

    sourceAsset.maintenance.forEach((item) => {
      maintenanceCount += 1;
      const maintenanceId = safeId(item.id);
      if (!maintenanceId) invalidItems.push(`${asset.assetTag}: maintenance record has an empty ID.`);
      if (maintenanceIds.has(maintenanceId)) duplicateItems.push(`Maintenance ID: ${maintenanceId}`);
      maintenanceIds.add(maintenanceId);
      if (item.documentDataUrl || item.documentName) documentCount += 1;
      if (isEmbedded(item.documentDataUrl)) embeddedMediaCount += 1;
    });
  });

  return {
    source,
    masterDataCount,
    sectionCounts,
    assetCount: source.assets.length,
    activeAssetCount: source.assets.filter((item) => item.asset.active).length,
    transactionCount,
    maintenanceCount,
    photoCount,
    documentCount,
    embeddedMediaCount,
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

export async function migrateInventoryToFirestore(
  analysis: InventoryMigrationAnalysis,
  migratedBy: { uid: string; email: string }
) {
  if (analysis.invalidItems.length || analysis.duplicateItems.length) {
    throw new Error("Resolve invalid or duplicate Inventory data before migration.");
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

  masterSections.forEach((section) => {
    analysis.source.masterData[section].forEach((item) => {
      const comparable = comparableMaster(section, item);
      operations.push({
        type: "set",
        reference: doc(firestore, "inventoryMasterData", masterId(section, item.id)),
        data: {
          ...comparable,
          valueLower: comparable.value.toLowerCase(),
          migratedAt: Timestamp.now(),
          schemaVersion: 1
        }
      });
    });
  });

  analysis.source.assets.forEach((sourceAsset) => {
    const asset = sourceAsset.asset;
    operations.push({
      type: "set",
      reference: doc(firestore, "inventoryAssets", safeId(asset.id)),
      data: {
        ...comparableAsset(asset, sourceAsset.hasPhoto),
        assetTagLower: asText(asset.assetTag).toLowerCase(),
        searchText: [asset.assetTag, asset.brand, asset.model, asset.serialNumber, asset.description]
          .map((value) => asText(value).toLowerCase())
          .join(" "),
        migratedAt: Timestamp.now(),
        schemaVersion: 1
      }
    });

    if (sourceAsset.hasPhoto) {
      const reference = photoReference(sourceAsset);
      operations.push({
        type: "set",
        reference: doc(firestore, "inventoryMediaReferences", reference.id),
        data: { ...reference, migratedAt: Timestamp.now(), schemaVersion: 1 }
      });
    }

    sourceAsset.transactions.forEach((item) => {
      operations.push({
        type: "set",
        reference: doc(firestore, "inventoryTransactions", safeId(item.id)),
        data: { ...comparableTransaction(item), migratedAt: Timestamp.now(), schemaVersion: 1 }
      });
    });

    sourceAsset.maintenance.forEach((item) => {
      operations.push({
        type: "set",
        reference: doc(firestore, "inventoryMaintenance", safeId(item.id)),
        data: { ...comparableMaintenance(item), migratedAt: Timestamp.now(), schemaVersion: 1 }
      });
      if (item.documentDataUrl || item.documentName) {
        const reference = documentReference(item);
        operations.push({
          type: "set",
          reference: doc(firestore, "inventoryMediaReferences", reference.id),
          data: { ...reference, migratedAt: Timestamp.now(), schemaVersion: 1 }
        });
      }
    });
  });

  await commitOperations(operations);
  const runId = `inventory-${Date.now()}`;
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, "migrationRuns", runId), {
    id: runId,
    type: "inventory",
    masterDataCount: analysis.masterDataCount,
    assetCount: analysis.assetCount,
    transactionCount: analysis.transactionCount,
    maintenanceCount: analysis.maintenanceCount,
    mediaReferenceCount: analysis.photoCount + analysis.documentCount,
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

export async function verifyInventoryMigration(
  analysis: InventoryMigrationAnalysis
): Promise<InventoryMigrationVerification> {
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
      const expected = comparableMaster(section, item);
      const actual = stores.inventoryMasterData.get(masterId(section, item.id));
      if (!actual) mismatches.push(`Missing ${section}: ${item.value}`);
      else if (JSON.stringify(pick(actual, expected)) !== JSON.stringify(expected)) {
        mismatches.push(`Master Data differs: ${section} - ${item.value}`);
      }
    });
  });

  analysis.source.assets.forEach((sourceAsset) => {
    const asset = sourceAsset.asset;
    const expectedAsset = comparableAsset(asset, sourceAsset.hasPhoto);
    const actualAsset = stores.inventoryAssets.get(safeId(asset.id));
    if (!actualAsset) mismatches.push(`Missing asset: ${asset.assetTag}`);
    else if (JSON.stringify(pick(actualAsset, expectedAsset)) !== JSON.stringify(expectedAsset)) {
      mismatches.push(`Asset differs: ${asset.assetTag}`);
    }

    sourceAsset.transactions.forEach((item) => {
      const expected = comparableTransaction(item);
      const actual = stores.inventoryTransactions.get(safeId(item.id));
      if (!actual) mismatches.push(`Missing transaction: ${asset.assetTag} - ${item.id}`);
      else if (JSON.stringify(pick(actual, expected)) !== JSON.stringify(expected)) {
        mismatches.push(`Transaction differs: ${asset.assetTag} - ${item.id}`);
      }
    });

    sourceAsset.maintenance.forEach((item) => {
      const expected = comparableMaintenance(item);
      const actual = stores.inventoryMaintenance.get(safeId(item.id));
      if (!actual) mismatches.push(`Missing maintenance: ${asset.assetTag} - ${item.id}`);
      else if (JSON.stringify(pick(actual, expected)) !== JSON.stringify(expected)) {
        mismatches.push(`Maintenance differs: ${asset.assetTag} - ${item.id}`);
      }
    });

    const references = [
      ...(sourceAsset.hasPhoto ? [photoReference(sourceAsset)] : []),
      ...sourceAsset.maintenance
        .filter((item) => item.documentDataUrl || item.documentName)
        .map(documentReference)
    ];
    references.forEach((expected) => {
      const actual = stores.inventoryMediaReferences.get(expected.id);
      if (!actual) mismatches.push(`Missing media reference: ${expected.id}`);
      else if (JSON.stringify(pick(actual, expected)) !== JSON.stringify(expected)) {
        mismatches.push(`Media reference differs: ${expected.id}`);
      }
    });
  });

  const expected = {
    masterData: analysis.masterDataCount,
    assets: analysis.assetCount,
    transactions: analysis.transactionCount,
    maintenance: analysis.maintenanceCount,
    mediaReferences: analysis.photoCount + analysis.documentCount
  };
  const actual = {
    masterData: stores.inventoryMasterData.size,
    assets: stores.inventoryAssets.size,
    transactions: stores.inventoryTransactions.size,
    maintenance: stores.inventoryMaintenance.size,
    mediaReferences: stores.inventoryMediaReferences.size
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
