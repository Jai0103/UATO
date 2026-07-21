import { postToGoogle } from "@/lib/google-api";
import type {
  InventoryActivity,
  InventoryAsset,
  InventoryAssetDetail,
  InventoryAssetSummary,
  InventoryDashboard,
  InventoryMaintenance,
  InventoryMasterData,
  InventoryTransaction
} from "@/lib/inventory";

export type InventoryAssetsPage = {
  assets: InventoryAssetSummary[];
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export type InventoryActivityPage = {
  activities: InventoryActivity[];
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export async function fetchInventoryMasterData() {
  const data = await postToGoogle<{ masterData: InventoryMasterData }>({
    action: "getInventoryMasterData"
  });
  return data.masterData;
}

export async function saveInventoryMasterData(masterData: InventoryMasterData) {
  const data = await postToGoogle<{ masterData: InventoryMasterData }>({
    action: "saveInventoryMasterData",
    masterData
  });
  return data.masterData;
}

export async function fetchInventoryDashboard() {
  const data = await postToGoogle<{ dashboard: InventoryDashboard }>({
    action: "getInventoryDashboard"
  });
  return data.dashboard;
}

export async function fetchInventoryAssetsPage(
  request: {
    page?: number;
    pageSize?: number;
    query?: string;
    equipmentType?: string;
    storageLocation?: string;
    operationalStatus?: string;
    availabilityStatus?: string;
    condition?: string;
    includeArchived?: boolean;
  } = {}
) {
  const data = await postToGoogle<InventoryAssetsPage>({
    action: "getInventoryAssetsPage",
    page: request.page || 1,
    pageSize: request.pageSize || 10,
    query: request.query?.trim() || "",
    equipmentType: request.equipmentType || "",
    storageLocation: request.storageLocation || "",
    operationalStatus: request.operationalStatus || "",
    availabilityStatus: request.availabilityStatus || "",
    condition: request.condition || "",
    includeArchived: Boolean(request.includeArchived)
  });
  return {
    assets: data.assets || [],
    page: data.page || 1,
    pageSize: data.pageSize || 10,
    totalRecords: data.totalRecords || 0,
    totalPages: Math.max(1, data.totalPages || 1),
    hasPreviousPage: Boolean(data.hasPreviousPage),
    hasNextPage: Boolean(data.hasNextPage)
  } satisfies InventoryAssetsPage;
}

export async function fetchInventoryAsset(assetId: string) {
  const data = await postToGoogle<{ detail: InventoryAssetDetail }>({
    action: "getInventoryAsset",
    assetId
  });
  return data.detail;
}

export async function saveInventoryAsset(asset: InventoryAsset) {
  const data = await postToGoogle<{ asset: InventoryAsset }>({
    action: "saveInventoryAsset",
    asset
  });
  return data.asset;
}

export async function archiveInventoryAsset(assetId: string) {
  return postToGoogle<{ assetId: string }>({
    action: "archiveInventoryAsset",
    assetId
  });
}

export async function saveInventoryTransaction(
  transaction: InventoryTransaction
) {
  const data = await postToGoogle<{ transaction: InventoryTransaction }>({
    action: "saveInventoryTransaction",
    transaction
  });
  return data.transaction;
}

export async function saveInventoryMaintenance(
  maintenance: InventoryMaintenance
) {
  const data = await postToGoogle<{ maintenance: InventoryMaintenance }>({
    action: "saveInventoryMaintenance",
    maintenance
  });
  return data.maintenance;
}

export async function fetchInventoryActivityPage(
  request: { page?: number; pageSize?: number; query?: string; year?: string } = {}
) {
  const data = await postToGoogle<InventoryActivityPage>({
    action: "getInventoryActivityPage",
    page: request.page || 1,
    pageSize: request.pageSize || 10,
    query: request.query?.trim() || "",
    year: request.year || ""
  });
  return {
    activities: data.activities || [],
    page: data.page || 1,
    pageSize: data.pageSize || 10,
    totalRecords: data.totalRecords || 0,
    totalPages: Math.max(1, data.totalPages || 1),
    hasPreviousPage: Boolean(data.hasPreviousPage),
    hasNextPage: Boolean(data.hasNextPage)
  } satisfies InventoryActivityPage;
}
