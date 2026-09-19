"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData
} from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase-client";
import type {
  AttendanceDashboard,
  AttendancePeriod,
  AttendanceRecordSummary,
  AttendanceSession,
  AttendanceSessionInput,
  AttendanceSubmission,
  PublicAttendanceSession
} from "@/lib/attendance";

function toIso(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return typeof value === "string" ? value : "";
}

function sessionFromDoc(id: string, data: DocumentData): AttendanceSession {
  return {
    id,
    token: String(data.token || ""),
    courseName: String(data.courseName || ""),
    courseCode: String(data.courseCode || ""),
    courseDate: String(data.courseDate || ""),
    instructorName: String(data.instructorName || ""),
    instructorEmail: String(data.instructorEmail || ""),
    schedule: data.schedule === "am" || data.schedule === "pm" ? data.schedule : "full_day",
    status: data.status === "open" || data.status === "closed" ? data.status : "draft",
    amOpen: data.amOpen === true,
    pmOpen: data.pmOpen === true,
    trainerComments: String(data.trainerComments || ""),
    createdByUid: String(data.createdByUid || ""),
    createdByEmail: String(data.createdByEmail || ""),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt)
  };
}

function submissionFromDoc(id: string, data: DocumentData): AttendanceSubmission {
  return {
    id,
    sessionId: String(data.sessionId || ""),
    publicToken: String(data.publicToken || ""),
    period: data.period === "pm" ? "pm" : "am",
    learnerName: String(data.learnerName || ""),
    learnerNameLower: String(data.learnerNameLower || ""),
    lastFour: String(data.lastFour || ""),
    identityHash: String(data.identityHash || ""),
    signatureDataUrl: String(data.signatureDataUrl || ""),
    submittedAt: toIso(data.submittedAt),
    updatedAt: toIso(data.updatedAt)
  };
}

async function requireAdmin() {
  await firebaseAuth.authStateReady();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Your Firebase session has expired. Please sign in again.");
  const profile = await getDoc(doc(firestore, "users", user.uid));
  if (!profile.exists() || profile.data().status !== "active" || profile.data().role !== "admin") {
    throw new Error("Administrator access is required.");
  }
  return user;
}

function publicProjection(session: AttendanceSessionInput, id: string, token: string) {
  return {
    sessionId: id,
    token,
    courseName: session.courseName.trim(),
    courseCode: session.courseCode.trim(),
    courseDate: session.courseDate,
    instructorName: session.instructorName.trim(),
    schedule: session.schedule,
    status: session.status,
    amOpen: session.status === "open" && session.amOpen,
    pmOpen: session.status === "open" && session.pmOpen,
    updatedAt: serverTimestamp()
  };
}

export async function fetchAttendanceSessions() {
  await requireAdmin();
  const snapshot = await getDocs(collection(firestore, "attendanceSessions"));
  return snapshot.docs
    .map((item) => sessionFromDoc(item.id, item.data()))
    .sort((a, b) => b.courseDate.localeCompare(a.courseDate) || b.updatedAt.localeCompare(a.updatedAt));
}

export async function fetchAttendanceDashboard(): Promise<AttendanceDashboard> {
  const [sessions, submissions] = await Promise.all([
    fetchAttendanceSessions(),
    requireAdmin().then(() => getDocs(collection(firestore, "attendanceSubmissions")))
  ]);
  const month = new Date().toISOString().slice(0, 7);
  return {
    totalSessions: sessions.length,
    openSessions: sessions.filter((item) => item.status === "open").length,
    totalAttendances: submissions.size,
    thisMonthSessions: sessions.filter((item) => item.courseDate.startsWith(month)).length
  };
}

export async function saveAttendanceSession(input: AttendanceSessionInput) {
  const user = await requireAdmin();
  const id = input.id || crypto.randomUUID();
  const reference = doc(firestore, "attendanceSessions", id);
  const existing = await getDoc(reference);
  const token = existing.exists() ? String(existing.data().token || "") : crypto.randomUUID();
  const now = serverTimestamp();
  const batch = writeBatch(firestore);

  batch.set(reference, {
    ...publicProjection(input, id, token),
    id,
    token,
    instructorEmail: input.instructorEmail.trim().toLowerCase(),
    trainerComments: input.trainerComments.trim(),
    createdByUid: existing.exists() ? String(existing.data().createdByUid || user.uid) : user.uid,
    createdByEmail: existing.exists() ? String(existing.data().createdByEmail || user.email || "") : user.email || "",
    createdAt: existing.exists() ? existing.data().createdAt || now : now,
    updatedAt: now
  });
  batch.set(doc(firestore, "attendancePublicSessions", token), publicProjection(input, id, token));
  await batch.commit();
  const saved = await getDoc(reference);
  return sessionFromDoc(saved.id, saved.data() || {});
}

export async function deleteAttendanceSession(session: AttendanceSession) {
  await requireAdmin();
  const submissions = await getDocs(
    query(collection(firestore, "attendanceSubmissions"), where("sessionId", "==", session.id))
  );
  const references = submissions.docs.map((item) => item.ref);
  for (let start = 0; start < references.length; start += 400) {
    const batch = writeBatch(firestore);
    references.slice(start, start + 400).forEach((reference) => batch.delete(reference));
    await batch.commit();
  }
  const batch = writeBatch(firestore);
  batch.delete(doc(firestore, "attendanceSessions", session.id));
  batch.delete(doc(firestore, "attendancePublicSessions", session.token));
  await batch.commit();
}

export async function fetchAttendanceSubmissions(sessionId: string) {
  await requireAdmin();
  const snapshot = await getDocs(
    query(collection(firestore, "attendanceSubmissions"), where("sessionId", "==", sessionId))
  );
  return snapshot.docs
    .map((item) => submissionFromDoc(item.id, item.data()))
    .sort((a, b) => a.learnerName.localeCompare(b.learnerName) || a.period.localeCompare(b.period));
}

export async function fetchAttendanceRecordSummaries(): Promise<AttendanceRecordSummary[]> {
  await requireAdmin();
  const [sessions, submissionSnapshot] = await Promise.all([
    fetchAttendanceSessions(),
    getDocs(collection(firestore, "attendanceSubmissions"))
  ]);
  const counts = new Map<
    string,
    { amCount: number; pmCount: number; learners: Set<string> }
  >();

  submissionSnapshot.docs.forEach((item) => {
    const data = item.data();
    const sessionId = String(data.sessionId || "");
    if (!sessionId) return;
    const current = counts.get(sessionId) || {
      amCount: 0,
      pmCount: 0,
      learners: new Set<string>()
    };
    if (data.period === "pm") current.pmCount += 1;
    else current.amCount += 1;
    const identity = String(data.identityHash || `${data.learnerNameLower || ""}|${data.lastFour || ""}`);
    if (identity) current.learners.add(identity);
    counts.set(sessionId, current);
  });

  return sessions.map((session) => {
    const current = counts.get(session.id);
    return {
      ...session,
      amCount: current?.amCount || 0,
      pmCount: current?.pmCount || 0,
      uniqueLearnerCount: current?.learners.size || 0
    };
  });
}

export async function deleteAttendanceSubmission(id: string) {
  await requireAdmin();
  await deleteDoc(doc(firestore, "attendanceSubmissions", id));
}

export async function updateAttendanceSubmission(
  id: string,
  values: Pick<AttendanceSubmission, "learnerName" | "lastFour">
) {
  await requireAdmin();
  const learnerName = values.learnerName.trim();
  const lastFour = values.lastFour.trim().toUpperCase();
  if (!learnerName || !/^[A-Z0-9]{4}$/.test(lastFour)) {
    throw new Error("Enter the learner name and exactly four NRIC/FIN characters.");
  }
  await updateDoc(doc(firestore, "attendanceSubmissions", id), {
    learnerName,
    learnerNameLower: learnerName.toLowerCase(),
    lastFour,
    updatedAt: serverTimestamp()
  });
}

export async function fetchPublicAttendanceSession(token: string) {
  const snapshot = await getDoc(doc(firestore, "attendancePublicSessions", token));
  if (!snapshot.exists()) throw new Error("This attendance link is invalid or no longer available.");
  const data = snapshot.data();
  const session: PublicAttendanceSession = {
    id: String(data.sessionId || ""),
    token: String(data.token || token),
    courseName: String(data.courseName || ""),
    courseCode: String(data.courseCode || ""),
    courseDate: String(data.courseDate || ""),
    instructorName: String(data.instructorName || ""),
    schedule: data.schedule === "am" || data.schedule === "pm" ? data.schedule : "full_day",
    status: data.status === "open" || data.status === "closed" ? data.status : "draft",
    amOpen: data.amOpen === true,
    pmOpen: data.pmOpen === true
  };
  return session;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function submitPublicAttendance(input: {
  session: PublicAttendanceSession;
  period: AttendancePeriod;
  learnerName: string;
  lastFour: string;
  signatureDataUrl: string;
}) {
  const learnerName = input.learnerName.trim().replace(/\s+/g, " ");
  const lastFour = input.lastFour.trim().toUpperCase();
  if (learnerName.length < 2 || learnerName.length > 100) throw new Error("Enter your full name as shown on your NRIC or passport.");
  if (!/^[A-Z0-9]{4}$/.test(lastFour)) throw new Error("Enter exactly the last four NRIC/FIN or travel document characters.");
  if (!input.signatureDataUrl.startsWith("data:image/png;base64,") || input.signatureDataUrl.length > 350000) {
    throw new Error("Please provide a valid signature.");
  }

  const identityHash = await sha256(`${learnerName.toLowerCase()}|${lastFour}`);
  const submissionId = `${input.session.id}_${input.period}_${identityHash.slice(0, 36)}`;
  const submissionReference = doc(firestore, "attendanceSubmissions", submissionId);

  try {
    // The deterministic document ID makes a second set an update. Public
    // users may create but cannot update, so duplicates remain protected
    // without allowing access to read another learner's signature.
    await setDoc(submissionReference, {
      id: submissionId,
      sessionId: input.session.id,
      publicToken: input.session.token,
      period: input.period,
      learnerName,
      learnerNameLower: learnerName.toLowerCase(),
      lastFour,
      identityHash,
      signatureDataUrl: input.signatureDataUrl,
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : "";
    if (errorMessage.includes("permission") || errorMessage.includes("insufficient")) {
      throw new Error(
        `Your ${input.period.toUpperCase()} attendance may already be submitted, or this signing window has closed.`
      );
    }
    throw error;
  }

  return submissionId;
}
