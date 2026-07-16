import { postToGoogle } from "@/lib/google-api";

export type AuditValue =
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | boolean
  | null;

export type AuditRecord = {
  id: string;
  timestamp: string;
  actorUserId: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  previousValue: AuditValue;
  updatedValue: AuditValue;
  details: AuditValue;
  detailsLoaded?: boolean;
};

export type AuditHistoryRequest = {
  page: number;
  pageSize?: number;
  query?: string;
  auditAction?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type AuditHistoryResponse = {
  records: AuditRecord[];
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  actionOptions: string[];
  entityTypeOptions: string[];
};

export async function fetchAuditHistoryPage(
  request: AuditHistoryRequest
) {
  return postToGoogle<AuditHistoryResponse>({
    action: "getAuditHistoryPage",
    ...request,
  });
}

export async function fetchAuditHistoryDetail(auditId: string) {
  const data = await postToGoogle<{ record: AuditRecord }>({
    action: "getAuditHistoryDetail",
    auditId,
  });

  if (!data.record) {
    throw new Error("The Audit History detail was not returned.");
  }

  if (data.record.detailsLoaded !== true) {
    throw new Error(
      "The Apps Script deployment is still using the old Audit History API. Deploy a new Apps Script version, then try again."
    );
  }

  return data.record;
}
