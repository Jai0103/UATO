import { postToGoogle } from "@/lib/google-api";
import type {
  StaffTrainingDescription,
  StaffTrainingRecord,
  StaffTrainingRecordSummary
} from "@/lib/staff-training";

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
