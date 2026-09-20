"use client";

import {
  doc,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type Transaction,
  type WriteBatch
} from "firebase/firestore";
import { firestore } from "@/lib/firebase-client";
import type { AuditValue } from "@/lib/audit-api";

export type FirebaseAuditInput = {
  id?: string;
  actorUserId: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  previousValue?: AuditValue;
  updatedValue?: AuditValue;
  details?: AuditValue;
  timestamp?: string;
};

function addFirebaseAudit(
  writer: {
    set(reference: DocumentReference<DocumentData>, data: DocumentData): unknown;
  },
  input: FirebaseAuditInput
) {
  const id = input.id || crypto.randomUUID();
  const timestamp = input.timestamp || new Date().toISOString();
  const actorName = input.actorName.trim() || "System User";
  const entityName = input.entityName.trim() || input.entityType;

  writer.set(doc(firestore, "auditEvents", id), {
    id,
    timestamp,
    actorUserId: input.actorUserId,
    actorName,
    actorNameLower: actorName.toLowerCase(),
    actorEmail: input.actorEmail.trim().toLowerCase(),
    actorRole: input.actorRole,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    entityName,
    entityNameLower: entityName.toLowerCase(),
    detailsAvailable: true,
    source: "firebase-live",
    schemaVersion: 2
  });
  writer.set(doc(firestore, "auditEventDetails", id), {
    auditId: id,
    entityId: input.entityId,
    previousValue: input.previousValue ?? null,
    updatedValue: input.updatedValue ?? null,
    details: input.details ?? null,
    source: "firebase-live",
    schemaVersion: 2
  });

  return id;
}

export function addFirebaseAuditToBatch(batch: WriteBatch, input: FirebaseAuditInput) {
  return addFirebaseAudit(batch, input);
}

export function addFirebaseAuditToTransaction(
  transaction: Transaction,
  input: FirebaseAuditInput
) {
  return addFirebaseAudit(transaction, input);
}

export async function writeFirebaseAudit(input: FirebaseAuditInput) {
  const batch = writeBatch(firestore);
  const id = addFirebaseAuditToBatch(batch, input);
  await batch.commit();
  return id;
}
