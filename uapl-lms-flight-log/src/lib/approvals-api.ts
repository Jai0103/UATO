"use client";

import { postToGoogle } from "@/lib/google-api";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  Timestamp,
  where,
  writeBatch,
  type DocumentData
} from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase-client";
import { addFirebaseAuditToBatch } from "@/lib/firebase-audit";
import type {
  ApprovalDashboardSummary,
  ApprovalDocument,
  ApprovalExpiryStatus,
  ApprovalRecord,
  ApprovalRecordSummary,
  ApprovalType
} from "@/lib/approvals";
import {
  buildApprovalDashboardSummary,
  summarizeApprovalRecord,
  validateApprovalRecord
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

function asText(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return String(value ?? "");
}

async function requireFirebaseAdmin() {
  await firebaseAuth.authStateReady();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Your Firebase session has expired. Please sign in again.");
  const profile = await getDoc(doc(firestore, "users", user.uid));
  if (!profile.exists()) throw new Error("Administrator access is required.");
  const data = profile.data();
  if (data.status !== "active" || data.role !== "admin") {
    throw new Error("Administrator access is required.");
  }
  return {
    user,
    name: asText(data.name || user.displayName || user.email || "Administrator"),
    email: asText(data.email || user.email || ""),
    role: "admin"
  };
}

function safeId(value: unknown) {
  return asText(value).trim().replace(/\//g, "_");
}

function locationDocumentId(approvalId: string, locationId: string) {
  return `${safeId(approvalId)}__${safeId(locationId)}`;
}

function documentDocumentId(approvalId: string, documentId: string) {
  return `${safeId(approvalId)}__${safeId(documentId)}`;
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

function recordFromDocument(
  id: string,
  data: DocumentData,
  locations: ReturnType<typeof locationFromDocument>[],
  documents: ReturnType<typeof documentFromDocument>[]
): ApprovalRecord {
  return {
    id: asText(data.id || id),
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
    locations,
    documents,
    archived: data.archived === true,
    version: Number(data.version) || 1,
    supersedesRecordId: asText(data.supersedesRecordId),
    createdAt: asText(data.createdAt),
    updatedAt: asText(data.updatedAt)
  };
}

function recordDocument(record: ApprovalRecord) {
  const activeLocations = record.locations.filter((location) => location.active);
  return {
    id: record.id,
    approvalType: record.approvalType,
    approvalNumber: record.approvalNumber.trim(),
    approvalNumberLower: record.approvalNumber.trim().toLowerCase(),
    issuingAuthority: record.issuingAuthority.trim(),
    effectiveDate: record.effectiveDate,
    expiryDate: record.expiryDate,
    responsiblePerson: record.responsiblePerson.trim(),
    responsibleEmail: record.responsibleEmail.trim().toLowerCase(),
    renewalLeadDays: Number(record.renewalLeadDays) || 90,
    renewalStatus: record.renewalStatus,
    renewalSubmittedAt: record.renewalSubmittedAt,
    renewalReference: record.renewalReference.trim(),
    generalConditions: record.generalConditions.trim(),
    remarks: record.remarks.trim(),
    archived: record.archived,
    version: record.version,
    supersedesRecordId: record.supersedesRecordId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    locationCount: record.locations.length,
    activeLocationCount: activeLocations.length,
    permittedLocations: activeLocations.map((location) => location.name.trim()).filter(Boolean),
    documentCount: record.documents.length,
    hasCurrentDocument: record.documents.some(
      (item) => item.status === "current" && Boolean(item.driveFileId)
    ),
    source: "firebase-live",
    schemaVersion: 2
  };
}

function locationDocument(approvalId: string, location: ApprovalRecord["locations"][number]) {
  return {
    ...location,
    approvalId,
    nameLower: location.name.trim().toLowerCase(),
    source: "firebase-live",
    schemaVersion: 2
  };
}

function approvalDocumentData(document: ApprovalDocument) {
  return {
    ...document,
    sourceSystem: "google-drive",
    source: "firebase-live",
    schemaVersion: 2
  };
}

function approvalAuditValue(record: ApprovalRecord) {
  const { documents, ...value } = record;
  return {
    ...value,
    documents: documents.map((item) => ({
      id: item.id,
      fileName: item.fileName,
      locationId: item.locationId,
      status: item.status,
      driveFileId: item.driveFileId
    }))
  };
}

async function loadFirebaseApprovalRecords() {
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

  return recordSnapshot.docs.map((item) => {
    const id = asText(item.data().id || item.id);
    return recordFromDocument(
      item.id,
      item.data(),
      locationsByApproval.get(id) || [],
      documentsByApproval.get(id) || []
    );
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
  const queryText = request.search?.trim().toLowerCase() || "";
  const records = (await loadFirebaseApprovalRecords())
    .map((record) => summarizeApprovalRecord(record))
    .filter((record) => request.includeArchived || !record.archived)
    .filter((record) => !request.approvalType || record.approvalType === request.approvalType)
    .filter((record) => !request.expiryStatus || record.expiryStatus === request.expiryStatus)
    .filter((record) => {
      if (!queryText) return true;
      return `${record.approvalNumber} ${record.issuingAuthority} ${record.responsiblePerson} ${record.permittedLocations.join(" ")}`
        .toLowerCase()
        .includes(queryText);
    })
    .sort(
      (first, second) =>
        Number(first.archived) - Number(second.archived) ||
        (first.daysRemaining ?? Number.MAX_SAFE_INTEGER) -
          (second.daysRemaining ?? Number.MAX_SAFE_INTEGER) ||
        second.updatedAt.localeCompare(first.updatedAt)
    );
  const pageSize = Math.max(1, Math.min(Number(request.pageSize) || 10, 50));
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const page = Math.max(1, Math.min(Number(request.page) || 1, totalPages));

  return {
    records: records.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: records.length,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages
  } satisfies ApprovalsPage;
}

export async function fetchApprovalRecord(approvalId: string) {
  const record = (await loadFirebaseApprovalRecords()).find(
    (item) => item.id === approvalId
  );
  if (!record) throw new Error("The approval record was not found.");
  return record;
}

export async function fetchFirebaseApprovalDashboardSummary() {
  return buildApprovalDashboardSummary(await loadFirebaseApprovalRecords());
}

export async function fetchApprovalDashboardSummary() {
  return fetchFirebaseApprovalDashboardSummary();
}

export async function saveApprovalRecord(approval: ApprovalRecord) {
  const validation = validateApprovalRecord(approval, false);
  if (!validation.valid) throw new Error(validation.errors[0]);
  const actor = await requireFirebaseAdmin();
  const existing = (await loadFirebaseApprovalRecords()).find(
    (record) => record.id === approval.id
  ) || null;
  const now = new Date().toISOString();
  const saved: ApprovalRecord = {
    ...approval,
    approvalNumber: approval.approvalNumber.trim(),
    issuingAuthority: approval.issuingAuthority.trim(),
    responsiblePerson: approval.responsiblePerson.trim(),
    responsibleEmail: approval.responsibleEmail.trim().toLowerCase(),
    renewalReference: approval.renewalReference.trim(),
    generalConditions: approval.generalConditions.trim(),
    remarks: approval.remarks.trim(),
    locations: approval.locations.map((location) => ({
      ...location,
      name: location.name.trim(),
      code: location.code.trim(),
      address: location.address.trim(),
      coordinates: location.coordinates.trim(),
      operationalLimitations: location.operationalLimitations.trim(),
      remarks: location.remarks.trim()
    })),
    documents: existing?.documents || approval.documents,
    version: existing ? existing.version + 1 : Math.max(1, approval.version),
    createdAt: existing?.createdAt || approval.createdAt || now,
    updatedAt: now
  };
  const existingLocations = await getDocs(
    query(collection(firestore, "approvalLocations"), where("approvalId", "==", saved.id))
  );
  const batch = writeBatch(firestore);
  existingLocations.docs.forEach((item) => batch.delete(item.ref));
  batch.set(doc(firestore, "approvalRecords", safeId(saved.id)), recordDocument(saved));
  saved.locations.forEach((location) => {
    batch.set(
      doc(firestore, "approvalLocations", locationDocumentId(saved.id, location.id)),
      locationDocument(saved.id, location)
    );
  });
  addFirebaseAuditToBatch(batch, {
    actorUserId: actor.user.uid,
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: existing ? "APPROVAL_UPDATED" : "APPROVAL_CREATED",
    entityType: "approval",
    entityId: saved.id,
    entityName: saved.approvalNumber,
    previousValue: existing ? approvalAuditValue(existing) : null,
    updatedValue: approvalAuditValue(saved),
    details: { approvalType: saved.approvalType, source: "firebase-primary" }
  });
  await batch.commit();
  const backupSync = postToGoogle<{ record: ApprovalRecord }>({
    action: "saveApprovalRecord",
    approval: saved
  }).catch((error) => {
    console.error("Approval Google backup sync failed", error);
    return { record: saved };
  });
  if (!existing) {
    // A new Drive upload may still use the legacy register to resolve its folder.
    await backupSync;
  } else {
    void backupSync;
  }
  return saved;
}

export async function archiveApprovalRecord(approvalId: string) {
  const actor = await requireFirebaseAdmin();
  const existing = await fetchApprovalRecord(approvalId);
  const archived: ApprovalRecord = {
    ...existing,
    archived: true,
    version: existing.version + 1,
    updatedAt: new Date().toISOString()
  };
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, "approvalRecords", safeId(approvalId)), recordDocument(archived));
  addFirebaseAuditToBatch(batch, {
    actorUserId: actor.user.uid,
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "APPROVAL_ARCHIVED",
    entityType: "approval",
    entityId: archived.id,
    entityName: archived.approvalNumber,
    previousValue: approvalAuditValue(existing),
    updatedValue: approvalAuditValue(archived),
    details: { approvalType: archived.approvalType, source: "firebase-primary" }
  });
  await batch.commit();
  void postToGoogle<{ record: ApprovalRecord }>({
    action: "archiveApprovalRecord",
    approvalId
  }).catch((error) => {
    console.error("Approval archive Google backup sync failed", error);
    return { record: archived };
  });
  return archived;
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
  const savedDocument: ApprovalDocument = {
    ...data.document,
    approvalId,
    locationId: data.document.locationId || locationId,
    fileName: data.document.fileName || file.name,
    mimeType: data.document.mimeType || "application/pdf",
    driveFileId: data.document.driveFileId || "",
    driveUrl: data.document.driveUrl || "",
    status: data.document.status === "superseded" ? "superseded" : "current",
    uploadedAt: data.document.uploadedAt || new Date().toISOString(),
    uploadedByName: data.document.uploadedByName || "",
    uploadedByEmail: data.document.uploadedByEmail || ""
  };
  const actor = await requireFirebaseAdmin();
  const existingRecord = await fetchApprovalRecord(approvalId);
  const existingDocuments = await getDocs(
    query(collection(firestore, "approvalDocuments"), where("approvalId", "==", approvalId))
  );
  const batch = writeBatch(firestore);
  existingDocuments.docs.forEach((item) => {
    const existingDocument = documentFromDocument(item.data());
    if (
      existingDocument.status === "current" &&
      existingDocument.locationId === locationId
    ) {
      batch.update(item.ref, { status: "superseded" });
    }
  });
  batch.set(
    doc(
      firestore,
      "approvalDocuments",
      documentDocumentId(approvalId, savedDocument.id)
    ),
    approvalDocumentData(savedDocument)
  );
  const updatedRecord: ApprovalRecord = {
    ...existingRecord,
    documents: [
      ...existingRecord.documents.map((item) =>
        item.status === "current" && item.locationId === locationId
          ? { ...item, status: "superseded" as const }
          : item
      ),
      savedDocument
    ],
    version: existingRecord.version + 1,
    updatedAt: new Date().toISOString()
  };
  batch.set(
    doc(firestore, "approvalRecords", safeId(approvalId)),
    recordDocument(updatedRecord)
  );
  addFirebaseAuditToBatch(batch, {
    actorUserId: actor.user.uid,
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "APPROVAL_DOCUMENT_UPLOADED",
    entityType: "approval",
    entityId: approvalId,
    entityName: existingRecord.approvalNumber,
    previousValue: null,
    updatedValue: {
      id: savedDocument.id,
      fileName: savedDocument.fileName,
      locationId: savedDocument.locationId,
      status: savedDocument.status,
      driveFileId: savedDocument.driveFileId
    },
    details: { approvalType: existingRecord.approvalType, source: "google-drive" }
  });
  await batch.commit();
  return savedDocument;
}

export async function fetchApprovalDocumentFile(documentId: string) {
  return postToGoogle<ApprovalDocumentFile>({
    action: "getApprovalDocumentFile",
    documentId
  });
}

export async function deleteApprovalDocument(documentId: string) {
  const actor = await requireFirebaseAdmin();
  const documentSnapshot = await getDocs(
    query(collection(firestore, "approvalDocuments"), where("id", "==", documentId))
  );
  const matched = documentSnapshot.docs[0];
  if (!matched) throw new Error("The approval document was not found.");
  const existingDocument = documentFromDocument(matched.data());
  const existingRecord = await fetchApprovalRecord(existingDocument.approvalId);
  const result = await postToGoogle<{ documentId: string }>({
    action: "deleteApprovalDocument",
    documentId
  });
  const updatedRecord: ApprovalRecord = {
    ...existingRecord,
    documents: existingRecord.documents.filter((item) => item.id !== documentId),
    version: existingRecord.version + 1,
    updatedAt: new Date().toISOString()
  };
  const batch = writeBatch(firestore);
  batch.delete(matched.ref);
  batch.set(
    doc(firestore, "approvalRecords", safeId(existingRecord.id)),
    recordDocument(updatedRecord)
  );
  addFirebaseAuditToBatch(batch, {
    actorUserId: actor.user.uid,
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "APPROVAL_DOCUMENT_DELETED",
    entityType: "approval",
    entityId: existingRecord.id,
    entityName: existingRecord.approvalNumber,
    previousValue: {
      id: existingDocument.id,
      fileName: existingDocument.fileName,
      locationId: existingDocument.locationId,
      status: existingDocument.status,
      driveFileId: existingDocument.driveFileId
    },
    updatedValue: null,
    details: { approvalType: existingRecord.approvalType, source: "google-drive" }
  });
  await batch.commit();
  return result;
}
