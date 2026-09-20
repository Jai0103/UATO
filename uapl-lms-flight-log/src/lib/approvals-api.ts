import { postToGoogle } from "@/lib/google-api";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  Timestamp,
  type DocumentData
} from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase-client";
import type {
  ApprovalDashboardSummary,
  ApprovalDocument,
  ApprovalExpiryStatus,
  ApprovalRecord,
  ApprovalRecordSummary,
  ApprovalType
} from "@/lib/approvals";
import { buildApprovalDashboardSummary } from "@/lib/approvals";

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

function asText(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return String(value ?? "");
}

async function requireFirebaseAdmin() {
  await firebaseAuth.authStateReady();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Your Firebase session has expired. Please sign in again.");
  const profile = await getDoc(doc(firestore, "users", user.uid));
  if (
    !profile.exists() ||
    profile.data().status !== "active" ||
    profile.data().role !== "admin"
  ) {
    throw new Error("Administrator access is required.");
  }
}

function locationFromDocument(data: DocumentData) {
  return {
    id: asText(data.id),
    name: asText(data.name),
    code: asText(data.code),
    address: asText(data.address),
    coordinates: asText(data.coordinates),
    effectiveDate: asText(data.effectiveDate).slice(0, 10),
    expiryDate: asText(data.expiryDate).slice(0, 10),
    operationalLimitations: asText(data.operationalLimitations),
    remarks: asText(data.remarks),
    active: data.active === true
  };
}

function documentFromDocument(data: DocumentData) {
  return {
    id: asText(data.id),
    approvalId: asText(data.approvalId),
    locationId: asText(data.locationId),
    fileName: asText(data.fileName),
    mimeType: asText(data.mimeType),
    driveFileId: asText(data.driveFileId),
    driveUrl: asText(data.driveUrl),
    status: data.status === "superseded" ? "superseded" as const : "current" as const,
    uploadedAt: asText(data.uploadedAt),
    uploadedByName: asText(data.uploadedByName),
    uploadedByEmail: asText(data.uploadedByEmail)
  };
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

export async function fetchFirebaseApprovalDashboardSummary() {
  await requireFirebaseAdmin();
  const [recordSnapshot, locationSnapshot, documentSnapshot] = await Promise.all([
    getDocs(collection(firestore, "approvalRecords")),
    getDocs(collection(firestore, "approvalLocations")),
    getDocs(collection(firestore, "approvalDocuments"))
  ]);
  const locationsByApproval = new Map<string, ReturnType<typeof locationFromDocument>[]>();
  const documentsByApproval = new Map<string, ReturnType<typeof documentFromDocument>[]>();

  locationSnapshot.docs.forEach((item) => {
    const approvalId = asText(item.data().approvalId);
    const values = locationsByApproval.get(approvalId) || [];
    values.push(locationFromDocument(item.data()));
    locationsByApproval.set(approvalId, values);
  });
  documentSnapshot.docs.forEach((item) => {
    const approvalId = asText(item.data().approvalId);
    const values = documentsByApproval.get(approvalId) || [];
    values.push(documentFromDocument(item.data()));
    documentsByApproval.set(approvalId, values);
  });

  const records: ApprovalRecord[] = recordSnapshot.docs.map((item) => {
    const data = item.data();
    const id = asText(data.id || item.id);
    return {
      id,
      approvalType: asText(data.approvalType) as ApprovalType,
      approvalNumber: asText(data.approvalNumber),
      issuingAuthority: asText(data.issuingAuthority),
      effectiveDate: asText(data.effectiveDate).slice(0, 10),
      expiryDate: asText(data.expiryDate).slice(0, 10),
      responsiblePerson: asText(data.responsiblePerson),
      responsibleEmail: asText(data.responsibleEmail),
      renewalLeadDays: Number(data.renewalLeadDays) || 90,
      renewalStatus: asText(data.renewalStatus) as ApprovalRecord["renewalStatus"],
      renewalSubmittedAt: asText(data.renewalSubmittedAt),
      renewalReference: asText(data.renewalReference),
      generalConditions: asText(data.generalConditions),
      remarks: asText(data.remarks),
      locations: locationsByApproval.get(id) || [],
      documents: documentsByApproval.get(id) || [],
      archived: data.archived === true,
      version: Number(data.version) || 1,
      supersedesRecordId: asText(data.supersedesRecordId),
      createdAt: asText(data.createdAt),
      updatedAt: asText(data.updatedAt)
    };
  });

  return buildApprovalDashboardSummary(records);
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
