import { postToGoogle } from "@/lib/google-api";
import type {
  ApprovalDashboardSummary,
  ApprovalDocument,
  ApprovalExpiryStatus,
  ApprovalRecord,
  ApprovalRecordSummary,
  ApprovalType
} from "@/lib/approvals";

export type ApprovalsPage = {
  records: ApprovalRecordSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export type ApprovalsPageRequest = {
  page?: number;
  pageSize?: number;
  search?: string;
  approvalType?: ApprovalType | "";
  expiryStatus?: ApprovalExpiryStatus | "";
  includeArchived?: boolean;
};

export type ApprovalDocumentFile = {
  document: ApprovalDocument;
  dataUrl: string;
};

export type ApprovalDocumentUpload = {
  approvalId: string;
  locationId?: string;
  file: File;
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("The selected PDF could not be read."));
        return;
      }
      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(new Error("The selected PDF could not be read."));
    };

    reader.readAsDataURL(file);
  });
}

export async function setupApprovals() {
  return postToGoogle<{
    message: string;
    folderId: string;
    folderUrl: string;
  }>({
    action: "setupApprovals"
  });
}

export async function fetchApprovalsPage(
  request: ApprovalsPageRequest = {}
) {
  const data = await postToGoogle<{
    records?: ApprovalRecordSummary[];
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
  }>({
    action: "getApprovalsPage",
    page: request.page || 1,
    pageSize: request.pageSize || 10,
    search: request.search?.trim() || "",
    approvalType: request.approvalType || "",
    expiryStatus: request.expiryStatus || "",
    includeArchived: Boolean(request.includeArchived)
  });

  const page = Math.max(1, data.page || 1);
  const totalPages = Math.max(1, data.totalPages || 1);

  return {
    records: data.records || [],
    page,
    pageSize: Math.max(1, data.pageSize || 10),
    total: Math.max(0, data.total || 0),
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages
  } satisfies ApprovalsPage;
}

export async function fetchApprovalRecord(approvalId: string) {
  const data = await postToGoogle<{ record: ApprovalRecord }>({
    action: "getApprovalRecord",
    approvalId
  });

  return data.record;
}

export async function fetchApprovalDashboardSummary() {
  const data = await postToGoogle<{
    dashboard: ApprovalDashboardSummary;
  }>({
    action: "getApprovalDashboardSummary"
  });

  return data.dashboard;
}

export async function saveApprovalRecord(approval: ApprovalRecord) {
  const data = await postToGoogle<{ record: ApprovalRecord }>({
    action: "saveApprovalRecord",
    approval
  });

  return data.record;
}

export async function archiveApprovalRecord(approvalId: string) {
  const data = await postToGoogle<{ record: ApprovalRecord }>({
    action: "archiveApprovalRecord",
    approvalId
  });

  return data.record;
}

export async function uploadApprovalDocument({
  approvalId,
  locationId = "",
  file
}: ApprovalDocumentUpload) {
  if (file.type !== "application/pdf") {
    throw new Error("Only PDF approval documents can be uploaded.");
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error("The PDF must be 10 MB or smaller.");
  }

  const dataUrl = await fileToDataUrl(file);
  const data = await postToGoogle<{ document: ApprovalDocument }>({
    action: "saveApprovalDocument",
    approvalId,
    locationId,
    fileName: file.name,
    dataUrl
  });

  return data.document;
}

export async function fetchApprovalDocumentFile(documentId: string) {
  return postToGoogle<ApprovalDocumentFile>({
    action: "getApprovalDocumentFile",
    documentId
  });
}

export async function deleteApprovalDocument(documentId: string) {
  return postToGoogle<{ documentId: string }>({
    action: "deleteApprovalDocument",
    documentId
  });
}
