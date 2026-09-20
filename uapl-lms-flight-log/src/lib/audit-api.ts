"use client";

import { collection, doc, getDoc, getDocs, Timestamp } from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase-client";
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

function asIso(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return typeof value === "string" ? value : "";
}

async function requireAdmin() {
  await firebaseAuth.authStateReady();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Your Firebase session has expired. Please sign in again.");
  const profile = await getDoc(doc(firestore, "users", user.uid));
  if (!profile.exists() || profile.data().status !== "active" || profile.data().role !== "admin") {
    throw new Error("Administrator access is required.");
  }
}

function eventFromDocument(id: string, data: Record<string, unknown>): AuditRecord {
  return {
    id,
    timestamp: asIso(data.timestamp),
    actorUserId: String(data.actorUserId || ""),
    actorName: String(data.actorName || ""),
    actorEmail: String(data.actorEmail || ""),
    actorRole: String(data.actorRole || ""),
    action: String(data.action || ""),
    entityType: String(data.entityType || ""),
    entityId: String(data.entityId || ""),
    entityName: String(data.entityName || ""),
    previousValue: null,
    updatedValue: null,
    details: null,
    detailsLoaded: false
  };
}

async function fetchFirebaseLiveRecords(request: AuditHistoryRequest) {
  await requireAdmin();
  const snapshot = await getDocs(collection(firestore, "auditEvents"));
  const queryText = String(request.query || "").trim().toLowerCase();
  const dateFrom = String(request.dateFrom || "");
  const dateTo = String(request.dateTo || "");
  return snapshot.docs
    .map((item) => eventFromDocument(item.id, item.data()))
    .filter((record) =>
      ["approval", "attendance", "fatigueRisk", "staffTraining", "uaMaintenance", "user"].includes(
      ["approval", "attendance", "fatigueRisk", "flightMasterData", "staffTraining", "uaMaintenance", "user"].includes(
        record.entityType
      )
    )
    .filter((record) => {
      const day = record.timestamp.slice(0, 10);
      if (request.auditAction && record.action !== request.auditAction) return false;
      if (request.entityType && record.entityType !== request.entityType) return false;
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      if (!queryText) return true;
      return `${record.actorName} ${record.actorEmail} ${record.action} ${record.entityName}`
        .toLowerCase()
        .includes(queryText);
    })
    .sort((first, second) => second.timestamp.localeCompare(first.timestamp));
}

function paginateFirebaseRecords(
  records: AuditRecord[],
  request: AuditHistoryRequest,
  actionOptions: string[],
  entityTypeOptions: string[]
): AuditHistoryResponse {
  const pageSize = Math.max(1, Math.min(Number(request.pageSize) || 10, 100));
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const page = Math.max(1, Math.min(Number(request.page) || 1, totalPages));
  return {
    records: records.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    totalRecords: records.length,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
    actionOptions,
    entityTypeOptions
  };
}

export async function fetchAuditHistoryPage(
  request: AuditHistoryRequest
) {
  const firebaseRecords = await fetchFirebaseLiveRecords(request);
  const firebaseActions = Array.from(
    new Set(firebaseRecords.map((record) => record.action))
  );

  if (
    request.entityType === "approval" ||
    request.entityType === "attendance" ||
    request.entityType === "flightMasterData" ||
    request.entityType === "user" ||
    request.entityType === "fatigueRisk" ||
    request.entityType === "staffTraining" ||
    request.entityType === "uaMaintenance" ||
    Boolean(request.auditAction && firebaseActions.includes(request.auditAction))
  ) {
    return paginateFirebaseRecords(
      firebaseRecords,
      request,
      firebaseActions.sort(),
      ["approval", "attendance", "fatigueRisk", "staffTraining", "uaMaintenance", "user"]
      ["approval", "attendance", "fatigueRisk", "flightMasterData", "staffTraining", "uaMaintenance", "user"]
    );
  }

  const googleResult = await postToGoogle<AuditHistoryResponse>({
    action: "getAuditHistoryPage",
    ...request
  });
  const actionOptions = Array.from(
    new Set([...(googleResult.actionOptions || []), ...firebaseActions])
  ).sort();
  const entityTypeOptions = Array.from(
    new Set([
      ...(googleResult.entityTypeOptions || []),
      "approval",
      "attendance",
      "fatigueRisk",
      "flightMasterData",
      "staffTraining",
      "uaMaintenance",
      "user"
    ])
  ).sort();

  if (request.entityType || request.page !== 1 || !firebaseRecords.length) {
    return { ...googleResult, actionOptions, entityTypeOptions };
  }

  const pageSize = googleResult.pageSize || request.pageSize || 10;
  const firebaseKeys = new Set(
    firebaseRecords.map((record) =>
      `${record.action}|${record.entityType}|${record.entityName}`.toLowerCase()
    )
  );
  const googleRecords = (googleResult.records || []).filter(
    (record) =>
      !firebaseKeys.has(
        `${record.action}|${record.entityType}|${record.entityName}`.toLowerCase()
      )
  );
  const records = [...firebaseRecords, ...googleRecords]
    .sort((first, second) => second.timestamp.localeCompare(first.timestamp))
    .slice(0, pageSize);
  const totalRecords = googleResult.totalRecords + firebaseRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  return {
    ...googleResult,
    records,
    totalRecords,
    totalPages,
    hasNextPage: totalPages > 1,
    actionOptions,
    entityTypeOptions
  };
}

export async function fetchAuditHistoryDetail(auditId: string) {
  await requireAdmin();
  const [eventSnapshot, detailSnapshot] = await Promise.all([
    getDoc(doc(firestore, "auditEvents", auditId)),
    getDoc(doc(firestore, "auditEventDetails", auditId))
  ]);
  if (!eventSnapshot.exists()) {
    const data = await postToGoogle<{ record: AuditRecord }>({
      action: "getAuditHistoryDetail",
      auditId
    });
    if (!data.record) throw new Error("The Audit History event was not found.");
    return data.record;
  }
  const record = eventFromDocument(eventSnapshot.id, eventSnapshot.data());
  const detail = detailSnapshot.exists() ? detailSnapshot.data() : {};
  return {
    ...record,
    previousValue: (detail.previousValue ?? null) as AuditValue,
    updatedValue: (detail.updatedValue ?? null) as AuditValue,
    details: (detail.details ?? null) as AuditValue,
    detailsLoaded: true
  };
}
