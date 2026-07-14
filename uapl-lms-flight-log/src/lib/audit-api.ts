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
