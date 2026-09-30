import { createHash, randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
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

type ActiveActor = {
  uid: string;
  name: string;
  email: string;
  role: Role;
};

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

async function requireActiveUser(uid: string | undefined): Promise<ActiveActor> {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in again to continue.");
  const snapshot = await db.collection("users").doc(uid).get();
  const data = snapshot.data() || {};
  if (!snapshot.exists || data.status !== "active") {
    throw new HttpsError("permission-denied", "An active account is required.");
  }
  return {
    uid,
    name: text(data.name) || "User",
    email: email(data.email),
    role: data.role === "admin" ? "admin" : "trainer"
  };
}

export const updateOwnProfile = callable(async (request) => {
  const actor = await requireActiveUser(request.auth?.uid);
  const name = text(request.data?.name);
  const photoURL = text(request.data?.photoURL);
  const avatarPath = text(request.data?.avatarPath);
  const expectedAvatarPath = `user-avatars/${actor.uid}/avatar.webp`;

  if (name.length < 2 || name.length > 100) {
    throw new HttpsError("invalid-argument", "Enter a name between 2 and 100 characters.");
  }
  if (avatarPath && avatarPath !== expectedAvatarPath) {
    throw new HttpsError("invalid-argument", "The profile image path is invalid.");
  }
  if (photoURL && !photoURL.startsWith("https://firebasestorage.googleapis.com/")) {
    throw new HttpsError("invalid-argument", "The profile image URL is invalid.");
  }

  const userReference = db.collection("users").doc(actor.uid);
  const snapshot = await userReference.get();
  const previous = snapshot.data() || {};
  const timestamp = new Date().toISOString();
  const updated = {
    ...previous,
    name,
    photoURL,
    avatarPath,
    updatedAt: timestamp
  };

  await auth.updateUser(actor.uid, { displayName: name, photoURL: photoURL || null });

  const batch = db.batch();
  batch.set(userReference, updated, { merge: true });
  const auditId = db.collection("auditEvents").doc().id;
  batch.set(db.collection("auditEvents").doc(auditId), {
    id: auditId,
    timestamp,
    actorUserId: actor.uid,
    actorName: name,
    actorNameLower: name.toLowerCase(),
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "PROFILE_UPDATED",
    entityType: "user",
    entityId: actor.uid,
    entityName: name,
    entityNameLower: name.toLowerCase(),
    detailsAvailable: true,
    source: "firebase-live",
    schemaVersion: 2
  });
  batch.set(db.collection("auditEventDetails").doc(auditId), {
    auditId,
    entityId: actor.uid,
    previousValue: {
      name: text(previous.name),
      photoURL: text(previous.photoURL)
    },
    updatedValue: { name, photoURL },
    details: null,
    source: "firebase-live",
    schemaVersion: 2
  });
  await batch.commit();

  return {
    profile: {
      uid: actor.uid,
      name,
      email: actor.email,
      role: actor.role,
      status: "active",
      photoURL,
      avatarPath,
      updatedAt: timestamp
    }
  };
});

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

function attendanceWindows(courseDate: string) {
  return {
    amOpensAt: new Date(`${courseDate}T08:00:00+08:00`),
    pmOpensAt: new Date(`${courseDate}T12:00:00+08:00`),
    closesAt: new Date(`${courseDate}T23:59:59+08:00`)
  };
}

function firestoreIso(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return text(value);
}

async function assignedAttendanceSession(actor: ActiveActor, sessionId: string) {
  const reference = db.collection("attendanceSessions").doc(sessionId);
  const snapshot = await reference.get();
  const data = snapshot.data() || {};
  if (!snapshot.exists || email(data.instructorEmail) !== actor.email) {
    throw new HttpsError("permission-denied", "This attendance session is not assigned to your account.");
  }
  return { reference, snapshot, data };
}

export const listTrainerAttendanceSessions = callable(async (request) => {
  const actor = await requireActiveUser(request.auth?.uid);
  if (!actor.email) throw new HttpsError("failed-precondition", "Your account has no email address.");
  const snapshot = await db.collection("attendanceSessions")
    .where("instructorEmail", "==", actor.email)
    .get();
  const now = Date.now();
  const candidates = snapshot.docs
    .map((item) => ({ id: item.id, data: item.data() }))
    .filter((item) => {
      if (item.data.status !== "open") return false;
      return attendanceWindows(text(item.data.courseDate)).closesAt.getTime() >= now;
    });
  const sessions = await Promise.all(candidates.map(async (item) => {
    const schedule = ["am", "pm"].includes(text(item.data.schedule)) ? text(item.data.schedule) : "full_day";
    const windows = attendanceWindows(text(item.data.courseDate));
    const amEnabled = schedule !== "pm";
    const pmEnabled = schedule !== "am";
    const amOpen = amEnabled && now >= windows.amOpensAt.getTime() && now <= windows.closesAt.getTime();
    const pmOpen = pmEnabled && now >= windows.pmOpensAt.getTime() && now <= windows.closesAt.getTime();
    const submissions = await db.collection("attendanceSubmissions").where("sessionId", "==", item.id).get();
    let amCount = 0;
    let pmCount = 0;
    submissions.docs.forEach((submission) => submission.data().period === "pm" ? pmCount += 1 : amCount += 1);
    const publicReference = db.collection("attendancePublicSessions").doc(text(item.data.token));
    await publicReference.set({
      sessionId: item.id,
      token: text(item.data.token),
      courseName: text(item.data.courseName),
      courseCode: text(item.data.courseCode),
      courseDate: text(item.data.courseDate),
      instructorName: text(item.data.instructorName),
      schedule,
      status: "open",
      amOpen: amEnabled,
      pmOpen: pmEnabled,
      amOpensAt: Timestamp.fromDate(windows.amOpensAt),
      pmOpensAt: Timestamp.fromDate(windows.pmOpensAt),
      closesAt: Timestamp.fromDate(windows.closesAt),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return {
      id: item.id,
      token: text(item.data.token),
      courseName: text(item.data.courseName),
      courseCode: text(item.data.courseCode),
      courseDate: text(item.data.courseDate),
      instructorName: text(item.data.instructorName),
      schedule,
      amOpen,
      pmOpen,
      amEnabled,
      pmEnabled,
      amOpensAt: windows.amOpensAt.toISOString(),
      pmOpensAt: windows.pmOpensAt.toISOString(),
      closesAt: windows.closesAt.toISOString(),
      amCount,
      pmCount
    };
  }));
  const sorted = sessions
    .filter((item) => item.token)
    .sort((first, second) => second.courseDate.localeCompare(first.courseDate));
  return { sessions: sorted };
});

export const getTrainerAttendanceSubmissions = callable(async (request) => {
  const actor = await requireActiveUser(request.auth?.uid);
  const sessionId = text(request.data?.sessionId);
  if (!sessionId) throw new HttpsError("invalid-argument", "Attendance session is required.");
  await assignedAttendanceSession(actor, sessionId);
  const snapshot = await db.collection("attendanceSubmissions").where("sessionId", "==", sessionId).get();
  const submissions = snapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      sessionId,
      publicToken: text(data.publicToken),
      period: data.period === "pm" ? "pm" : "am",
      learnerName: text(data.learnerName),
      learnerNameLower: text(data.learnerNameLower),
      lastFour: text(data.lastFour),
      identityHash: text(data.identityHash),
      signatureDataUrl: text(data.signatureDataUrl),
      submittedAt: firestoreIso(data.submittedAt),
      updatedAt: firestoreIso(data.updatedAt)
    };
  }).sort((first, second) => first.learnerName.localeCompare(second.learnerName));
  return { submissions };
});

export const listTrainerAttendanceReportSummaries = callable(async (request) => {
  const actor = await requireActiveUser(request.auth?.uid);
  const sessionSnapshot = await db.collection("attendanceSessions")
    .where("instructorEmail", "==", actor.email)
    .get();
  const records = await Promise.all(sessionSnapshot.docs.map(async (item) => {
    const data = item.data();
    const submissions = await db.collection("attendanceSubmissions").where("sessionId", "==", item.id).get();
    let amCount = 0;
    let pmCount = 0;
    const learners = new Set<string>();
    submissions.docs.forEach((submission) => {
      const entry = submission.data();
      entry.period === "pm" ? pmCount += 1 : amCount += 1;
      learners.add(text(entry.identityHash) || `${text(entry.learnerNameLower)}|${text(entry.lastFour)}`);
    });
    return {
      id: item.id,
      token: text(data.token),
      courseName: text(data.courseName),
      courseCode: text(data.courseCode),
      courseDate: text(data.courseDate),
      instructorName: text(data.instructorName),
      instructorEmail: email(data.instructorEmail),
      schedule: ["am", "pm"].includes(text(data.schedule)) ? text(data.schedule) : "full_day",
      status: ["open", "closed"].includes(text(data.status)) ? text(data.status) : "draft",
      amOpen: data.amOpen === true,
      pmOpen: data.pmOpen === true,
      trainerComments: text(data.trainerComments),
      createdByUid: text(data.createdByUid),
      createdByEmail: email(data.createdByEmail),
      createdAt: firestoreIso(data.createdAt),
      updatedAt: firestoreIso(data.updatedAt),
      amCount,
      pmCount,
      uniqueLearnerCount: learners.size
    };
  }));
  records.sort((first, second) => second.courseDate.localeCompare(first.courseDate));
  return { records };
});

export const listTrainerEvaluationSessions = callable(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in again to continue.");
  const profileSnapshot = await db.collection("users").doc(uid).get();
  const profile = profileSnapshot.data();
  if (!profileSnapshot.exists || profile?.status !== "active") {
    throw new HttpsError("permission-denied", "An active account is required.");
  }
  const trainerEmail = email(profile.email);
  if (!trainerEmail) throw new HttpsError("failed-precondition", "Your account has no email address.");
  const snapshot = await db.collection("evaluationSessions")
    .where("trainerEmail", "==", trainerEmail)
    .get();
  const sessions = snapshot.docs
    .map((item) => ({ id: item.id, data: item.data() }))
    .filter((item) => {
      if (item.data.status !== "open") return false;
      const closesAt = Date.parse(text(item.data.closesAt));
      return !Number.isFinite(closesAt) || closesAt >= Date.now();
    })
    .map((item) => ({
      id: item.id,
      token: text(item.data.token),
      courseName: text(item.data.courseName),
      trainingDate: text(item.data.trainingDate),
      location: text(item.data.location),
      trainerName: text(item.data.trainerName),
      opensAt: text(item.data.opensAt),
      closesAt: text(item.data.closesAt)
    }))
    .filter((item) => item.token)
    .sort((first, second) => second.trainingDate.localeCompare(first.trainingDate));
  await Promise.all(sessions.map(async (session) => {
    const publicReference = db.collection("evaluationPublicSessions").doc(session.token);
    if ((await publicReference.get()).exists) return;
    const questionSnapshot = await db.collection("evaluationSessionQuestions")
      .where("sessionId", "==", session.id)
      .get();
    const questions = questionSnapshot.docs
      .map((item) => evaluationQuestion(item.data()))
      .filter((question) => question.id && question.text)
      .sort((first, second) => first.sortOrder - second.sortOrder);
    if (!questions.length) return;
    await publicReference.set({
      sessionId: session.id,
      courseName: session.courseName,
      trainerName: session.trainerName,
      trainingDate: session.trainingDate,
      location: session.location,
      status: "open",
      opensAt: session.opensAt,
      closesAt: session.closesAt,
      questions,
      updatedAt: new Date().toISOString(),
      schemaVersion: 2
    });
  }));
  return { sessions };
});

type PublicEvaluationQuestion = {
  id: string;
  section: string;
  text: string;
  sortOrder: number;
  responseType: "rating" | "yesNo" | "multipleChoice" | "text";
  required: boolean;
  scaleMin: number;
  scaleMax: number;
  scaleMinLabel: string;
  scaleMaxLabel: string;
  options: string[];
};

function evaluationHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function evaluationQuestion(value: unknown): PublicEvaluationQuestion {
  const source = (value || {}) as Record<string, unknown>;
  const responseType = text(source.responseType);
  return {
    id: text(source.id || source.questionId),
    section: text(source.section) || "General",
    text: text(source.text || source.questionText),
    sortOrder: Number(source.sortOrder) || 0,
    responseType: (["rating", "yesNo", "multipleChoice", "text"].includes(responseType)
      ? responseType
      : "rating") as PublicEvaluationQuestion["responseType"],
    required: source.required !== false,
    scaleMin: Number(source.scaleMin) || 1,
    scaleMax: Number(source.scaleMax) || 5,
    scaleMinLabel: text(source.scaleMinLabel),
    scaleMaxLabel: text(source.scaleMaxLabel),
    options: Array.isArray(source.options)
      ? source.options.map(text).filter(Boolean).slice(0, 20)
      : []
  };
}

function evaluationAvailability(session: Record<string, unknown>) {
  const now = Date.now();
  const opensAt = Date.parse(text(session.opensAt));
  const closesAt = Date.parse(text(session.closesAt));
  if (session.status !== "open") return "This evaluation session is not open yet.";
  if (Number.isFinite(opensAt) && opensAt > now) return "This evaluation session is not open yet.";
  if (Number.isFinite(closesAt) && closesAt < now) return "This evaluation session has closed.";
  return "";
}

async function publicEvaluationSnapshot(token: string) {
  const reference = db.collection("evaluationPublicSessions").doc(token);
  const existing = await reference.get();
  if (existing.exists) return existing;

  const matches = await db.collection("evaluationSessions")
    .where("token", "==", token)
    .limit(1)
    .get();
  if (matches.empty) return existing;
  const session = matches.docs[0];
  const data = session.data();
  const questionSnapshot = await db.collection("evaluationSessionQuestions")
    .where("sessionId", "==", session.id)
    .get();
  const questions = questionSnapshot.docs
    .map((item) => evaluationQuestion(item.data()))
    .filter((question) => question.id && question.text)
    .sort((first, second) => first.sortOrder - second.sortOrder);
  if (!questions.length) return existing;
  await reference.set({
    sessionId: session.id,
    courseName: text(data.courseName),
    trainerName: text(data.trainerName),
    trainingDate: text(data.trainingDate),
    location: text(data.location),
    status: text(data.status),
    opensAt: text(data.opensAt),
    closesAt: text(data.closesAt),
    questions,
    updatedAt: new Date().toISOString(),
    schemaVersion: 2
  });
  return reference.get();
}

export const getPublicEvaluation = callable(async (request) => {
  const token = text(request.data?.token);
  const submissionKey = text(request.data?.submissionKey);
  if (token.length < 16 || submissionKey.length < 16) {
    throw new HttpsError("invalid-argument", "This evaluation link is incomplete.");
  }
  const snapshot = await publicEvaluationSnapshot(token);
  if (!snapshot.exists) throw new HttpsError("not-found", "This evaluation session was not found.");
  const data = snapshot.data() || {};
  const sessionId = text(data.sessionId);
  const deviceHash = evaluationHash(submissionKey);
  const duplicate = await db
    .collection("evaluationResponseKeys")
    .doc(`${sessionId}__${deviceHash}`)
    .get();
  const unavailableReason = evaluationAvailability(data);
  return {
    session: {
      id: sessionId,
      courseName: text(data.courseName),
      trainerName: text(data.trainerName),
      trainingDate: text(data.trainingDate),
      location: text(data.location),
      status: text(data.status),
      available: !unavailableReason && !duplicate.exists,
      unavailableReason: duplicate.exists
        ? "An evaluation has already been submitted from this device."
        : unavailableReason,
      alreadySubmitted: duplicate.exists,
      questions: Array.isArray(data.questions)
        ? data.questions.map(evaluationQuestion).filter((item) => item.id && item.text)
            .sort((first, second) => first.sortOrder - second.sortOrder)
        : []
    }
  };
});

export const submitPublicEvaluation = callable(async (request) => {
  const token = text(request.data?.token);
  const submissionKey = text(request.data?.submissionKey);
  const website = text(request.data?.website);
  const formStartedAt = Number(request.data?.formStartedAt) || 0;
  if (token.length < 16 || submissionKey.length < 16 || website) {
    throw new HttpsError("invalid-argument", "The evaluation could not be submitted.");
  }
  if (!formStartedAt || Date.now() - formStartedAt < 1500) {
    throw new HttpsError("failed-precondition", "Please review the form before submitting.");
  }
  const publicSnapshot = await publicEvaluationSnapshot(token);
  if (!publicSnapshot.exists) throw new HttpsError("not-found", "This evaluation session was not found.");
  const publicData = publicSnapshot.data() || {};
  const unavailableReason = evaluationAvailability(publicData);
  if (unavailableReason) throw new HttpsError("failed-precondition", unavailableReason);
  const sessionId = text(publicData.sessionId);
  const questions = (Array.isArray(publicData.questions) ? publicData.questions : [])
    .map(evaluationQuestion)
    .filter((item) => item.id && item.text);
  const standard = questions.some((question) => question.id.startsWith("aga-v2-q"));
  const trainingComponent = text(request.data?.trainingComponent);
  const theoryDelivery = text(request.data?.theoryDeliveryMode);
  if (standard && (!["Theory", "Practical", "Both"].includes(trainingComponent) ||
    (trainingComponent !== "Practical" && !["In person", "Online synchronous"].includes(theoryDelivery)))) {
    throw new HttpsError("invalid-argument", "Select the training component and theory delivery.");
  }
  const applicable = (question: PublicEvaluationQuestion) => {
    if (!standard) return true;
    if (question.section === "Theory Training" && trainingComponent === "Practical") return false;
    if (question.section === "Practical Flight Training" && trainingComponent === "Theory") return false;
    if (question.id.endsWith("-online")) return trainingComponent !== "Practical" && theoryDelivery === "Online synchronous";
    if (["aga-v2-q31", "aga-v2-q32"].includes(question.id)) {
      return trainingComponent === "Practical" || theoryDelivery !== "Online synchronous";
    }
    return true;
  };
  const submittedAnswers = Array.isArray(request.data?.answers)
    ? request.data.answers as Array<Record<string, unknown>>
    : [];
  const answerMap = new Map(submittedAnswers.map((answer) => [text(answer.questionId), answer]));
  const normalizedAnswers = questions.filter(applicable).map((question) => {
    const supplied = answerMap.get(question.id) || {};
    const rating = Number(supplied.rating) || 0;
    const value = text(supplied.value).slice(0, 2000);
    if (question.required) {
      if (question.responseType === "rating" && (rating < question.scaleMin || rating > question.scaleMax)) {
        throw new HttpsError("invalid-argument", "Complete every required rating.");
      }
      if (question.responseType !== "rating" && !value) {
        throw new HttpsError("invalid-argument", "Complete every required question.");
      }
    }
    if (question.responseType === "yesNo" && value && !["yes", "no"].includes(value)) {
      throw new HttpsError("invalid-argument", "Select a valid response.");
    }
    if (question.responseType === "multipleChoice" && value && !question.options.includes(value)) {
      throw new HttpsError("invalid-argument", "Select a valid response option.");
    }
    return { question, rating, value };
  });
  const studentName = text(request.data?.studentName).slice(0, 120);
  const company = text(request.data?.company).slice(0, 160);
  if (standard && (!studentName || !company)) {
    throw new HttpsError("invalid-argument", "Enter your name and company or organisation.");
  }
  const recommendTraining = text(request.data?.recommendTraining);
  if ((standard && !recommendTraining) || (recommendTraining && !["yes", "no"].includes(recommendTraining))) {
    throw new HttpsError("invalid-argument", "Select a valid recommendation.");
  }
  const responseId = db.collection("evaluationResponses").doc().id;
  const deviceHash = evaluationHash(submissionKey);
  const keyReference = db.collection("evaluationResponseKeys").doc(`${sessionId}__${deviceHash}`);
  const responseReference = db.collection("evaluationResponses").doc(responseId);
  const sessionReference = db.collection("evaluationSessions").doc(sessionId);
  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const [keySnapshot, sessionSnapshot] = await Promise.all([
      transaction.get(keyReference),
      transaction.get(sessionReference)
    ]);
    if (keySnapshot.exists) {
      throw new HttpsError("already-exists", "An evaluation has already been submitted from this device.");
    }
    if (!sessionSnapshot.exists || sessionSnapshot.data()?.status !== "open") {
      throw new HttpsError("failed-precondition", "This evaluation session is no longer open.");
    }
    const legacyRatings: Record<string, number> = {};
    normalizedAnswers.forEach(({ question, rating }) => {
      if (question.responseType === "rating") legacyRatings[question.id] = rating;
    });
    transaction.set(responseReference, {
      id: responseId,
      sessionId,
      courseName: text(sessionSnapshot.data()?.courseName),
      trainingDate: text(sessionSnapshot.data()?.trainingDate),
      trainerName: text(sessionSnapshot.data()?.trainerName),
      trainerEmail: email(sessionSnapshot.data()?.trainerEmail),
      studentName,
      studentNameLower: studentName.toLowerCase(),
      company,
      trainingComponent: standard ? trainingComponent : "",
      theoryDeliveryMode: standard && trainingComponent !== "Practical" ? theoryDelivery : "",
      recommendTraining,
      mostUseful: text(request.data?.mostUseful).slice(0, 1200),
      improvements: text(request.data?.improvements).slice(0, 1200),
      additionalComments: text(request.data?.additionalComments).slice(0, 1200),
      submittedAt: now,
      source: "firebase-live",
      schemaVersion: 2,
      ...legacyRatings
    });
    normalizedAnswers.forEach(({ question, rating, value }) => {
      transaction.set(db.collection("evaluationAnswers").doc(`${responseId}__${question.id}`), {
        id: `${responseId}__${question.id}`,
        responseId,
        sessionId,
        questionId: question.id,
        questionText: question.text,
        section: question.section,
        responseType: question.responseType,
        rating: question.responseType === "rating" ? rating : 0,
        value: question.responseType === "rating" ? "" : value,
        submittedAt: now,
        schemaVersion: 2
      });
    });
    transaction.set(keyReference, { sessionId, responseId, deviceHash, submittedAt: now });
    transaction.update(sessionReference, {
      responseCount: FieldValue.increment(1),
      updatedAt: now
    });
  });
  return {
    submission: {
      responseId,
      submittedAt: now,
      message: "Thank you. Your evaluation has been submitted successfully."
    }
  };
});

type NotificationState = "unread" | "read" | "follow_up";
type NotificationPriority = "info" | "warning" | "critical";

type UserNotification = {
  id: string;
  title: string;
  message: string;
  category: "approval" | "attendance" | "evaluation" | "flight" | "maintenance" | "training" | "fatigue" | "system";
  priority: NotificationPriority;
  actionUrl: string;
  actionLabel: string;
  eventDate: string;
  state: NotificationState;
};

function notificationStateId(uid: string, notificationId: string) {
  return createHash("sha256").update(`${uid}:${notificationId}`).digest("hex");
}

function dateMillis(value: unknown) {
  const source = text(value);
  if (!source) return 0;
  const parsed = Date.parse(source.length === 10 ? `${source}T12:00:00+08:00` : source);
  return Number.isFinite(parsed) ? parsed : 0;
}

function singaporeTodayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function currentWeekMondayKey() {
  const today = singaporeTodayKey();
  const date = new Date(`${today}T12:00:00+08:00`);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function notificationFingerprint(values: string[]) {
  return createHash("sha256")
    .update([...values].sort().join("|"))
    .digest("hex")
    .slice(0, 12);
}

function itemPreview(values: string[]) {
  const clean = values.map((value) => value.trim()).filter(Boolean);
  if (clean.length <= 3) return clean.join(", ");
  return `${clean.slice(0, 3).join(", ")} and ${clean.length - 3} more`;
}

function dayDifference(value: unknown) {
  const target = dateMillis(value);
  if (!target) return null;
  const today = dateMillis(singaporeTodayKey());
  return Math.ceil((target - today) / 86_400_000);
}

function approvalMessage(name: string, days: number) {
  if (days < 0) return `${name} expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago.`;
  if (days === 0) return `${name} expires today.`;
  return `${name} expires in ${days} day${days === 1 ? "" : "s"}.`;
}

export const listUserNotifications = callable(async (request) => {
  const actor = await requireActiveUser(request.auth?.uid);
  const attendancePromise = db.collection("attendanceSessions")
    .where("instructorEmail", "==", actor.email)
    .get();
  const evaluationPromise = db.collection("evaluationSessions")
    .where("trainerEmail", "==", actor.email)
    .get();
  const statePromise = db.collection("notificationStates")
    .where("uid", "==", actor.uid)
    .get();
  const approvalPromise = actor.role === "admin"
    ? db.collection("approvalRecords").get()
    : Promise.resolve(null);
  const flightRecordsPromise = actor.role === "admin"
    ? db.collection("flightLogRecords").get()
    : Promise.resolve(null);
  const flightSignaturesPromise = actor.role === "admin"
    ? db.collection("flightLogSignatures").get()
    : Promise.resolve(null);
  const maintenanceRecordsPromise = actor.role === "admin"
    ? db.collection("uaMaintenanceRecords").get()
    : Promise.resolve(null);
  const maintenanceMasterPromise = actor.role === "admin"
    ? db.collection("uaMaintenanceMasterData").get()
    : Promise.resolve(null);
  const staffTrainingPromise = actor.role === "admin"
    ? db.collection("staffTrainingRecords").get()
    : Promise.resolve(null);
  const fatigueRecordsPromise = actor.role === "admin"
    ? db.collection("fatigueRiskRecords").get()
    : Promise.resolve(null);
  const usersPromise = actor.role === "admin"
    ? db.collection("users").get()
    : Promise.resolve(null);

  const [
    attendanceSnapshot,
    evaluationSnapshot,
    stateSnapshot,
    approvalSnapshot,
    flightRecordsSnapshot,
    flightSignaturesSnapshot,
    maintenanceRecordsSnapshot,
    maintenanceMasterSnapshot,
    staffTrainingSnapshot,
    fatigueRecordsSnapshot,
    usersSnapshot
  ] =
    await Promise.all([
      attendancePromise,
      evaluationPromise,
      statePromise,
      approvalPromise,
      flightRecordsPromise,
      flightSignaturesPromise,
      maintenanceRecordsPromise,
      maintenanceMasterPromise,
      staffTrainingPromise,
      fatigueRecordsPromise,
      usersPromise
    ]);

  const states = new Map<string, NotificationState>();
  stateSnapshot.docs.forEach((item) => {
    const data = item.data();
    const state = text(data.state);
    if (["read", "follow_up"].includes(state)) {
      states.set(text(data.notificationId), state as NotificationState);
    }
  });

  const notifications: UserNotification[] = [];

  attendanceSnapshot.docs.forEach((item) => {
    const data = item.data();
    if (data.status !== "open" || (data.amOpen !== true && data.pmOpen !== true)) return;
    const id = `attendance:${item.id}`;
    const courseName = text(data.courseName) || "Assigned course";
    const periods = [data.amOpen === true ? "AM" : "", data.pmOpen === true ? "PM" : ""]
      .filter(Boolean)
      .join(" and ");
    const courseDays = dayDifference(data.courseDate);
    notifications.push({
      id,
      title: "Attendance QR is ready",
      message: `${courseName} has an open ${periods || "attendance"} check-in session.`,
      category: "attendance",
      priority: courseDays !== null && courseDays <= 0 ? "warning" : "info",
      actionUrl: "/attendance/trainer",
      actionLabel: "Open attendance",
      eventDate: text(data.courseDate) || new Date().toISOString(),
      state: states.get(id) || "unread"
    });
  });

  evaluationSnapshot.docs.forEach((item) => {
    const data = item.data();
    const closesAt = dateMillis(data.closesAt);
    if (data.status !== "open" || (closesAt && closesAt < Date.now())) return;
    const id = `evaluation:${item.id}`;
    const hoursRemaining = closesAt ? (closesAt - Date.now()) / 3_600_000 : null;
    notifications.push({
      id,
      title: "Student evaluation is open",
      message: `${text(data.courseName) || "Assigned course"} is ready for learner feedback.`,
      category: "evaluation",
      priority: hoursRemaining !== null && hoursRemaining <= 24 ? "warning" : "info",
      actionUrl: "/evaluations/trainer",
      actionLabel: "Open evaluation",
      eventDate: text(data.trainingDate) || text(data.opensAt) || new Date().toISOString(),
      state: states.get(id) || "unread"
    });
  });

  approvalSnapshot?.docs.forEach((item) => {
    const data = item.data();
    if (data.archived === true) return;
    const days = dayDifference(data.expiryDate);
    if (days === null || days > 90) return;
    const id = `approval:${item.id}`;
    const name = text(data.approvalNumber) || text(data.approvalType) || "Regulatory approval";
    notifications.push({
      id,
      title: days < 0 ? "Approval has expired" : "Approval renewal approaching",
      message: approvalMessage(name, days),
      category: "approval",
      priority: days <= 0 ? "critical" : days <= 30 ? "warning" : "info",
      actionUrl: "/approvals",
      actionLabel: "View register",
      eventDate: text(data.expiryDate) || new Date().toISOString(),
      state: states.get(id) || "unread"
    });
  });

  if (flightRecordsSnapshot && flightSignaturesSnapshot) {
    const signedIds = new Set(flightSignaturesSnapshot.docs.map((item) => item.id));
    const incomplete = flightRecordsSnapshot.docs.filter((item) =>
      !signedIds.has(item.id) || Number(item.data().flightCount) <= 0
    );
    if (incomplete.length) {
      const ids = incomplete.map((item) => item.id);
      const names = incomplete.map((item) => text(item.data().studentName) || item.id);
      const id = `flight:${notificationFingerprint(ids)}`;
      notifications.push({
        id,
        title: "Flight logs need completion",
        message: `${incomplete.length} record${incomplete.length === 1 ? "" : "s"} need a signature or flight entry: ${itemPreview(names)}.`,
        category: "flight",
        priority: "warning",
        actionUrl: "/records",
        actionLabel: "Review records",
        eventDate: singaporeTodayKey(),
        state: states.get(id) || "unread"
      });
    }
  }

  if (maintenanceRecordsSnapshot && maintenanceMasterSnapshot) {
    const latestByAircraft = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    maintenanceRecordsSnapshot.docs.forEach((item) => {
      const data = item.data();
      const keys = [text(data.uaId), text(data.uaModel)]
        .map((value) => value.toLowerCase())
        .filter(Boolean);
      keys.forEach((key) => {
        const current = latestByAircraft.get(key);
        if (!current || text(data.inspectionDate) > text(current.data().inspectionDate)) {
          latestByAircraft.set(key, item);
        }
      });
    });
    const activeAircraftMap = new Map<string, string>();
    maintenanceMasterSnapshot.docs
      .map((item) => item.data())
      .filter((data) => data.section === "uaModels" && data.status !== "inactive")
      .forEach((data) => {
        const label = text(data.linkedUaId) || text(data.value);
        const key = label.toLowerCase();
        if (key && label) activeAircraftMap.set(key, label);
      });
    const activeAircraft = Array.from(activeAircraftMap, ([key, label]) => ({ key, label }));
    const failed = activeAircraft.filter((aircraft) =>
      Number(latestByAircraft.get(aircraft.key)?.data().failCount) > 0
    );
    const overdue = activeAircraft.filter((aircraft) => {
      const inspectionDate = latestByAircraft.get(aircraft.key)?.data().inspectionDate;
      const age = dayDifference(inspectionDate);
      return age === null || age < -31;
    });
    if (failed.length) {
      const id = `maintenance:${notificationFingerprint(failed.map((item) => `failed-${item.key}`))}`;
      notifications.push({
        id,
        title: "UA maintenance failure requires action",
        message: `${failed.length} aircraft have failed items on their latest check: ${itemPreview(failed.map((item) => item.label))}.`,
        category: "maintenance",
        priority: "critical",
        actionUrl: "/ua-maintenance/records",
        actionLabel: "Review maintenance",
        eventDate: singaporeTodayKey(),
        state: states.get(id) || "unread"
      });
    }
    if (overdue.length) {
      const id = `maintenance:${notificationFingerprint(overdue.map((item) => `overdue-${item.key}`))}`;
      notifications.push({
        id,
        title: "Monthly UA maintenance is overdue",
        message: `${overdue.length} aircraft need a current monthly check: ${itemPreview(overdue.map((item) => item.label))}.`,
        category: "maintenance",
        priority: "warning",
        actionUrl: "/ua-maintenance",
        actionLabel: "Open checklist",
        eventDate: singaporeTodayKey(),
        state: states.get(id) || "unread"
      });
    }
  }

  if (staffTrainingSnapshot) {
    const incomplete = staffTrainingSnapshot.docs.filter((item) => {
      const data = item.data();
      const total = Number(data.totalCount) || 0;
      return total > 0 && (Number(data.completedCount) || 0) < total;
    });
    if (incomplete.length) {
      const id = `training:${notificationFingerprint(incomplete.map((item) => item.id))}`;
      const names = incomplete.map((item) => text(item.data().staffName) || item.id);
      notifications.push({
        id,
        title: "Staff training remains incomplete",
        message: `${incomplete.length} staff checklist${incomplete.length === 1 ? " is" : "s are"} incomplete: ${itemPreview(names)}.`,
        category: "training",
        priority: "warning",
        actionUrl: "/staff-training/records",
        actionLabel: "Review training",
        eventDate: singaporeTodayKey(),
        state: states.get(id) || "unread"
      });
    }
  }

  if (fatigueRecordsSnapshot && usersSnapshot) {
    const monday = currentWeekMondayKey();
    const completedEmails = new Set(
      fatigueRecordsSnapshot.docs
        .filter((item) => text(item.data().assessmentDate) === monday)
        .map((item) => email(item.data().instructorEmail))
        .filter(Boolean)
    );
    const missing = usersSnapshot.docs
      .map((item) => item.data())
      .filter((data) => data.status === "active" && email(data.email) && !completedEmails.has(email(data.email)))
      .map((data) => text(data.name) || email(data.email));
    if (missing.length) {
      const id = `fatigue:${monday.replace(/-/g, "")}`;
      notifications.push({
        id,
        title: "Weekly fatigue checks are outstanding",
        message: `${missing.length} active user${missing.length === 1 ? " has" : "s have"} no checklist for this week: ${itemPreview(missing)}.`,
        category: "fatigue",
        priority: "warning",
        actionUrl: "/fatigue-risk",
        actionLabel: "Complete checks",
        eventDate: monday,
        state: states.get(id) || "unread"
      });
    }
  }

  const priorityOrder: Record<NotificationPriority, number> = {
    critical: 0,
    warning: 1,
    info: 2
  };
  notifications.sort((first, second) =>
    (first.state === "unread" ? 0 : 1) - (second.state === "unread" ? 0 : 1) ||
    priorityOrder[first.priority] - priorityOrder[second.priority] ||
    dateMillis(second.eventDate) - dateMillis(first.eventDate)
  );
  const limited = notifications.slice(0, 24);
  return {
    notifications: limited,
    unreadCount: limited.filter((item) => item.state === "unread").length
  };
});

export const setUserNotificationState = callable(async (request) => {
  const actor = await requireActiveUser(request.auth?.uid);
  const notificationId = text(request.data?.notificationId);
  const nextState = text(request.data?.state);
  if (!notificationId || notificationId.length > 180 || !/^[a-z]+:[A-Za-z0-9_-]+$/.test(notificationId)) {
    throw new HttpsError("invalid-argument", "The notification reference is invalid.");
  }
  if (!["unread", "read", "follow_up"].includes(nextState)) {
    throw new HttpsError("invalid-argument", "Select a valid notification state.");
  }
  await db.collection("notificationStates")
    .doc(notificationStateId(actor.uid, notificationId))
    .set({
      uid: actor.uid,
      notificationId,
      state: nextState,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  return { notificationId, state: nextState };
});
