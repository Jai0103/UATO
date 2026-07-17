import { postToGoogle } from "@/lib/google-api";

import type {
  UaMaintenanceMasterData,
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

export async function fetchUaMaintenanceMasterData() {
  const data = await postToGoogle<{
    masterData: UaMaintenanceMasterData;
  }>({
    action: "getUaMaintenanceMasterData"
  });

  return data.masterData;
}

export async function saveUaMaintenanceMasterData(
  masterData: UaMaintenanceMasterData
) {
  const data = await postToGoogle<{
    masterData: UaMaintenanceMasterData;
  }>({
    action: "saveUaMaintenanceMasterData",
    masterData
  });

  return data.masterData;
}

export async function fetchUaMaintenanceRecordsPage(
  request: {
    page?: number;
    pageSize?: number;
    query?: string;
    year?: string;
  } = {}
) {
  const data = await postToGoogle<UaMaintenanceRecordsPage>({
    action: "getUaMaintenanceRecordsPage",
    page: request.page || 1,
    pageSize: request.pageSize || 10,
    query: request.query?.trim() || "",
    year: request.year || ""
  });

  return {
    records: data.records || [],
    page: data.page || 1,
    pageSize: data.pageSize || 10,
    totalRecords: data.totalRecords || 0,
    totalPages: Math.max(1, data.totalPages || 1),
    hasPreviousPage: Boolean(data.hasPreviousPage),
    hasNextPage: Boolean(data.hasNextPage)
  } satisfies UaMaintenanceRecordsPage;
}

export async function fetchUaMaintenanceRecord(
  recordId: string
) {
  const data = await postToGoogle<{
    record: UaMaintenanceRecord;
  }>({
    action: "getUaMaintenanceRecord",
    recordId
  });

  return data.record;
}

export async function saveUaMaintenanceRecord(
  record: UaMaintenanceRecord
) {
  const data = await postToGoogle<{
    record: UaMaintenanceRecord;
  }>({
    action: "saveUaMaintenanceRecord",
    record
  });

  return data.record;
}

export async function deleteUaMaintenanceRecord(
  recordId: string
) {
  return postToGoogle<{
    recordId: string;
  }>({
    action: "deleteUaMaintenanceRecord",
    recordId
  });
}
