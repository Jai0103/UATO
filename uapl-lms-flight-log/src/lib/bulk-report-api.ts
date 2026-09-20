import type {
  FlightLogRecord
} from "@/lib/flight-log-storage";

import type {
  StaffTrainingRecord
} from "@/lib/staff-training";

import type {
  UaMaintenanceRecord,
  UaMaintenanceRecordSummary
} from "@/lib/ua-maintenance";

import {
  fetchUaMaintenanceRecord,
  fetchUaMaintenanceRecordsPage
} from "@/lib/ua-maintenance-api";

import type {
  FatigueRiskRecord
} from "@/lib/fatigue-risk";

import {
  fetchFatigueRiskReportRecords,
  fetchFatigueRiskReportTrainerNames as fetchFirebaseFatigueRiskReportTrainerNames
} from "@/lib/fatigue-risk-api";

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
  const summaries: UaMaintenanceRecordSummary[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const result = await fetchUaMaintenanceRecordsPage({
      page,
      pageSize: 25,
      query: "",
      year: "",
      month: ""
    });
    summaries.push(
      ...result.records.filter(
        (record) =>
          (!request.dateFrom || record.inspectionDate >= request.dateFrom) &&
          (!request.dateTo || record.inspectionDate <= request.dateTo)
      )
    );
    totalPages = result.totalPages;
    page += 1;
  } while (page <= totalPages);

  const records: UaMaintenanceRecord[] = [];
  for (let index = 0; index < summaries.length; index += 5) {
    records.push(
      ...(await Promise.all(
        summaries
          .slice(index, index + 5)
          .map((record) => fetchUaMaintenanceRecord(record.id))
      ))
    );
  }
  return records;
}

export async function fetchBulkFatigueRiskReportRecords(
  request: {
    dateFrom: string;
    dateTo: string;
    trainerName: string;
  }
) {
  return fetchFatigueRiskReportRecords(request) satisfies Promise<FatigueRiskRecord[]>;
}

export async function fetchFatigueRiskReportTrainerNames(
  request: {
    dateFrom: string;
    dateTo: string;
  }
) {
  return fetchFirebaseFatigueRiskReportTrainerNames(request);
}
