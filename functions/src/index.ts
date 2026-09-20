import { randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  CallableRequest,
  HttpsError,
  onCall
} from "firebase-functions/v2/https";

initializeApp();

const db = getFirestore();
const auth = getAuth();
const region = "asia-southeast1";

type Role = "admin" | "trainer";
type Status = "active" | "inactive";

type AdminActor = {
  uid: string;
  name: string;
  email: string;
  role: "admin";
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function email(value: unknown) {
  return text(value).toLowerCase();
}

function role(value: unknown): Role {
  if (value !== "admin" && value !== "trainer") {
    throw new HttpsError("invalid-argument", "Select a valid account role.");
  }
  return value;
}

function status(value: unknown): Status {
  if (value !== "active" && value !== "inactive") {
    throw new HttpsError("invalid-argument", "Select a valid account status.");
  }
  return value;
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function requireAdmin(uid: string | undefined): Promise<AdminActor> {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in again to continue.");
  const snapshot = await db.collection("users").doc(uid).get();
  if (!snapshot.exists) {
    throw new HttpsError("permission-denied", "Administrator access is required.");
  }
  const profile = snapshot.data() || {};
  if (profile.status !== "active" || profile.role !== "admin") {
    throw new HttpsError("permission-denied", "Administrator access is required.");
  }
  return {
    uid,
    name: text(profile.name) || "Administrator",
    email: email(profile.email),
    role: "admin"
  };
}

async function ensureAnotherActiveAdmin(targetUid: string) {
  const snapshot = await db
    .collection("users")
    .where("role", "==", "admin")
    .where("status", "==", "active")
    .get();
  const others = snapshot.docs.filter((item) => item.id !== targetUid);
  if (!others.length) {
    throw new HttpsError(
      "failed-precondition",
      "Create or activate another administrator before changing this account."
    );
  }
}

function auditBatch(
  batch: FirebaseFirestore.WriteBatch,
  actor: AdminActor,
  action: string,
  entityId: string,
  entityName: string,
  previousValue: unknown,
  updatedValue: unknown,
  details: unknown = null
) {
  const id = db.collection("auditEvents").doc().id;
  const timestamp = new Date().toISOString();
  batch.set(db.collection("auditEvents").doc(id), {
    id,
    timestamp,
    actorUserId: actor.uid,
    actorName: actor.name,
    actorNameLower: actor.name.toLowerCase(),
    actorEmail: actor.email,
    actorRole: actor.role,
    action,
    entityType: "user",
    entityId,
    entityName,
    entityNameLower: entityName.toLowerCase(),
    detailsAvailable: true,
    source: "firebase-live",
    schemaVersion: 2
  });
  batch.set(db.collection("auditEventDetails").doc(id), {
    auditId: id,
    entityId,
    previousValue: previousValue ?? null,
    updatedValue: updatedValue ?? null,
    details: details ?? null,
    source: "firebase-live",
    schemaVersion: 2
  });
}

function callable(
  handler: (
    request: CallableRequest<Record<string, unknown>>
  ) => Promise<unknown>
) {
  return onCall<Record<string, unknown>, Promise<unknown>>(
    { region, enforceAppCheck: false },
    handler
  );
}

export const adminCreateUser = callable(async (request) => {
  const actor = await requireAdmin(request.auth?.uid);
  const name = text(request.data?.name);
  const userEmail = email(request.data?.email);
  const userRole = role(request.data?.role);

  if (name.length < 2 || name.length > 100 || !validEmail(userEmail)) {
    throw new HttpsError("invalid-argument", "Enter a valid name and email address.");
  }

  try {
    await auth.getUserByEmail(userEmail);
    throw new HttpsError("already-exists", "An account already uses this email address.");
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const code = text((error as { code?: string }).code);
    if (code !== "auth/user-not-found") throw error;
  }

  const account = await auth.createUser({
    email: userEmail,
    displayName: name,
    password: randomBytes(32).toString("base64url"),
    disabled: false
  });

  const now = new Date().toISOString();
  const profile = {
    sourceUserId: account.uid,
    name,
    email: userEmail,
    emailLower: userEmail,
    role: userRole,
    status: "active" as const,
    createdAt: now,
    passwordChangedAt: null,
    migratedAt: null,
    migrationSource: "firebase-live",
    schemaVersion: 2,
    updatedAt: now,
    updatedByUid: actor.uid
  };

  try {
    const batch = db.batch();
    batch.set(db.collection("users").doc(account.uid), profile);
    auditBatch(batch, actor, "User created", account.uid, name, null, profile, {
      email: userEmail,
      role: userRole
    });
    await batch.commit();
  } catch (error) {
    await auth.deleteUser(account.uid).catch(() => undefined);
    throw error;
  }

  return { user: { id: account.uid, ...profile } };
});

export const adminUpdateUser = callable(async (request) => {
  const actor = await requireAdmin(request.auth?.uid);
  const uid = text(request.data?.uid);
  const name = text(request.data?.name);
  const userRole = role(request.data?.role);
  if (!uid || name.length < 2 || name.length > 100) {
    throw new HttpsError("invalid-argument", "Enter a valid user name.");
  }
  const reference = db.collection("users").doc(uid);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "User profile not found.");
  const previous = snapshot.data() || {};
  if (previous.role === "admin" && userRole !== "admin") {
    await ensureAnotherActiveAdmin(uid);
  }
  await auth.updateUser(uid, { displayName: name });
  const updated = {
    ...previous,
    name,
    role: userRole,
    updatedAt: new Date().toISOString(),
    updatedByUid: actor.uid
  };
  const batch = db.batch();
  batch.set(reference, updated);
  auditBatch(batch, actor, "User updated", uid, name, previous, updated);
  await batch.commit();
  return { user: { id: uid, ...updated } };
});

export const adminSetUserStatus = callable(async (request) => {
  const actor = await requireAdmin(request.auth?.uid);
  const uid = text(request.data?.uid);
  const nextStatus = status(request.data?.status);
  if (!uid) throw new HttpsError("invalid-argument", "User ID is required.");
  if (uid === actor.uid && nextStatus === "inactive") {
    throw new HttpsError("failed-precondition", "You cannot deactivate your own account.");
  }
  const reference = db.collection("users").doc(uid);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "User profile not found.");
  const previous = snapshot.data() || {};
  if (previous.role === "admin" && nextStatus === "inactive") {
    await ensureAnotherActiveAdmin(uid);
  }
  await auth.updateUser(uid, { disabled: nextStatus === "inactive" });
  if (nextStatus === "inactive") await auth.revokeRefreshTokens(uid);
  const updated = {
    ...previous,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
    updatedByUid: actor.uid
  };
  const batch = db.batch();
  batch.set(reference, updated);
  auditBatch(
    batch,
    actor,
    nextStatus === "inactive" ? "User deactivated" : "User activated",
    uid,
    text(previous.name) || text(previous.email),
    previous,
    updated
  );
  await batch.commit();
  return { user: { id: uid, ...updated } };
});

export const adminRequestPasswordReset = callable(async (request) => {
  const actor = await requireAdmin(request.auth?.uid);
  const uid = text(request.data?.uid);
  if (!uid) throw new HttpsError("invalid-argument", "User ID is required.");
  const reference = db.collection("users").doc(uid);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "User profile not found.");
  const profile = snapshot.data() || {};
  const batch = db.batch();
  auditBatch(
    batch,
    actor,
    "User password reset requested",
    uid,
    text(profile.name) || text(profile.email),
    null,
    null,
    { email: email(profile.email) }
  );
  batch.update(reference, {
    passwordResetRequestedAt: new Date().toISOString(),
    updatedByUid: actor.uid
  });
  await batch.commit();
  return { email: email(profile.email) };
});

export const adminDeleteUser = callable(async (request) => {
  const actor = await requireAdmin(request.auth?.uid);
  const uid = text(request.data?.uid);
  if (!uid) throw new HttpsError("invalid-argument", "User ID is required.");
  if (uid === actor.uid) {
    throw new HttpsError("failed-precondition", "You cannot delete your own account.");
  }
  const reference = db.collection("users").doc(uid);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "User profile not found.");
  const previous = snapshot.data() || {};
  if (previous.role === "admin" && previous.status === "active") {
    await ensureAnotherActiveAdmin(uid);
  }
  await auth.deleteUser(uid);
  const batch = db.batch();
  batch.delete(reference);
  auditBatch(
    batch,
    actor,
    "User deleted",
    uid,
    text(previous.name) || text(previous.email),
    previous,
    null,
    { email: email(previous.email), deletedAt: FieldValue.serverTimestamp() }
  );
  await batch.commit();
  return { uid };
});
