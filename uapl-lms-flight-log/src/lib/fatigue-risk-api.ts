import { postToGoogle } from "@/lib/google-api";
import type {
  FatigueRiskRecord,
  FatigueRiskRecordSummary
} from "@/lib/fatigue-risk";

export type FatigueRiskRecordsPage = {
  records: FatigueRiskRecordSummary[];
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export async function fetchFatigueRiskRecordsPage(
  request: {
    page?: number;
    pageSize?: number;
    query?: string;
    year?: string;
    month?: string;
  } = {}
) {
  const data = await postToGoogle<FatigueRiskRecordsPage>({
    action: "getFatigueRiskRecordsPage",
    page: request.page || 1,
    pageSize: request.pageSize || 10,
    query: request.query?.trim() || "",
    year: request.year || "",
    month: request.month || ""
  });

  return {
    records: data.records || [],
    page: data.page || 1,
    pageSize: data.pageSize || 10,
    totalRecords: data.totalRecords || 0,
    totalPages: Math.max(1, data.totalPages || 1),
    hasPreviousPage: Boolean(data.hasPreviousPage),
    hasNextPage: Boolean(data.hasNextPage)
  } satisfies FatigueRiskRecordsPage;
}

export async function fetchFatigueRiskRecord(recordId: string) {
  const data = await postToGoogle<{ record: FatigueRiskRecord }>({
    action: "getFatigueRiskRecord",
    recordId
  });
  return data.record;
}

export async function saveFatigueRiskRecord(record: FatigueRiskRecord) {
  const data = await postToGoogle<{ record: FatigueRiskRecord }>({
    action: "saveFatigueRiskRecord",
    record
  });
  return data.record;
}

export async function deleteFatigueRiskRecord(recordId: string) {
  return postToGoogle<{ recordId: string }>({
    action: "deleteFatigueRiskRecord",
    recordId
  });
}
