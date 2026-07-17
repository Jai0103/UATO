import { postToGoogle } from "@/lib/google-api";
import type {
  StaffTrainingDescription,
  StaffTrainingRecord,
  StaffTrainingRecordSummary
} from "@/lib/staff-training";

export type StaffTrainingRecordsPage = {
  records: StaffTrainingRecordSummary[];
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export async function fetchStaffTrainingDescriptions() {
  const data = await postToGoogle<{
    descriptions: StaffTrainingDescription[];
  }>({ action: "getStaffTrainingDescriptions" });

  return data.descriptions || [];
}

export async function saveStaffTrainingDescriptions(
  descriptions: StaffTrainingDescription[]
) {
  const data = await postToGoogle<{
    descriptions: StaffTrainingDescription[];
  }>({
    action: "saveStaffTrainingDescriptions",
    descriptions
  });

  return data.descriptions || [];
}

export async function fetchStaffTrainingRecords() {
  const data = await postToGoogle<{
    records: StaffTrainingRecordSummary[];
  }>({ action: "getStaffTrainingRecords" });

  return data.records || [];
}

export async function fetchStaffTrainingRecordsPage(
  request: {
    page?: number;
    pageSize?: number;
    query?: string;
  } = {}
) {
  const data = await postToGoogle<StaffTrainingRecordsPage>({
    action: "getStaffTrainingRecordsPage",
    page: request.page || 1,
    pageSize: request.pageSize || 10,
    query: request.query?.trim() || ""
  });

  return {
    records: data.records || [],
    page: data.page || 1,
    pageSize: data.pageSize || 10,
    totalRecords: data.totalRecords || 0,
    totalPages: Math.max(1, data.totalPages || 1),
    hasPreviousPage: Boolean(data.hasPreviousPage),
    hasNextPage: Boolean(data.hasNextPage)
  } satisfies StaffTrainingRecordsPage;
}

export async function fetchStaffTrainingRecord(recordId: string) {
  const data = await postToGoogle<{
    record: StaffTrainingRecord;
  }>({
    action: "getStaffTrainingRecord",
    recordId
  });

  return data.record;
}

export async function saveStaffTrainingRecord(
  record: StaffTrainingRecord
) {
  const data = await postToGoogle<{
    record: StaffTrainingRecord;
  }>({
    action: "saveStaffTrainingRecord",
    record
  });

  return data.record;
}

export async function deleteStaffTrainingRecord(recordId: string) {
  return postToGoogle<{ recordId: string }>({
    action: "deleteStaffTrainingRecord",
    recordId
  });
}

export async function setupStaffTraining() {
  return postToGoogle<{ message: string }>({
    action: "setupStaffTraining"
  });
}
