import type {
  FlightLogRecord
} from "@/lib/flight-log-storage";

import type {
  StaffTrainingRecord
} from "@/lib/staff-training";

import type {
  UaMaintenanceRecord
} from "@/lib/ua-maintenance";

import type {
  FatigueRiskRecord
} from "@/lib/fatigue-risk";

import {
  postToGoogle
} from "@/lib/google-api";

export async function fetchBulkFlightReportRecords(
  request: {
    dateFrom: string;
    dateTo: string;
  }
) {
  const data = await postToGoogle<{
    records: FlightLogRecord[];
  }>({
    action:
      "getBulkFlightReportRecords",
    ...request
  });

  return data.records || [];
}

export async function fetchBulkStaffTrainingReportRecords(
  request: {
    staffName: string;
    monthFrom: string;
    monthTo: string;
  }
) {
  const data = await postToGoogle<{
    records: StaffTrainingRecord[];
  }>({
    action:
      "getBulkStaffTrainingReportRecords",
    ...request
  });

  return data.records || [];
}

export async function fetchBulkUaMaintenanceReportRecords(
  request: {
    dateFrom: string;
    dateTo: string;
  }
) {
  const data = await postToGoogle<{
    records: UaMaintenanceRecord[];
  }>({
    action:
      "getBulkUaMaintenanceReportRecords",
    ...request
  });

  return data.records || [];
}

export async function fetchBulkFatigueRiskReportRecords(
  request: {
    dateFrom: string;
    dateTo: string;
    trainerName: string;
  }
) {
  const data = await postToGoogle<{
    records: FatigueRiskRecord[];
  }>({
    action:
      "getBulkFatigueRiskReportRecords",
    ...request
  });

  return data.records || [];
}

export async function fetchFatigueRiskReportTrainerNames(
  request: {
    dateFrom: string;
    dateTo: string;
  }
) {
  const data = await postToGoogle<{
    trainerNames: string[];
  }>({
    action: "getFatigueRiskReportTrainerNames",
    ...request
  });

  return data.trainerNames || [];
}
