import type {
  FlightLogRecord
} from "@/lib/flight-log-storage";

import type {
  StaffTrainingRecord
} from "@/lib/staff-training";

import type {
  UaMaintenanceRecord
} from "@/lib/ua-maintenance";

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
