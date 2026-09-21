"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  type DocumentData
} from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase-client";
import { addFirebaseAuditToBatch } from "@/lib/firebase-audit";
import {
  evaluationRatingFields,
  type EvaluationRatingField,
  type EvaluationResponse,
  type EvaluationResponseSummary,
  type EvaluationResponsesPage,
  type EvaluationDashboard,
  type EvaluationSession,
  type EvaluationSessionInput,
  type EvaluationSessionsPage,
  type EvaluationSessionStatus
} from "@/lib/evaluations";

export type EvaluationQuestionType =
  | "rating"
  | "yesNo"
  | "multipleChoice"
  | "text";

export type EvaluationQuestion = {
  id: string;
  templateId: string;
  section: string;
  text: string;
  sortOrder: number;
  responseType: EvaluationQuestionType;
  required: boolean;
  status: "active" | "inactive";
  version: number;
  scaleMin: number;
  scaleMax: number;
  scaleMinLabel: string;
  scaleMaxLabel: string;
  options: string[];
  createdAt: string;
  updatedAt: string;
};

export type EvaluationQuestionInput = Omit<
  EvaluationQuestion,
  "version" | "createdAt" | "updatedAt"
>;

export type EvaluationAnswer = {
  responseId: string;
  questionId: string;
  rating: number;
  value: string;
};

type AdminActor = {
  uid: string;
  name: string;
  email: string;
  role: "admin";
};

let cachedActor: { actor: AdminActor; expiresAt: number } | null = null;

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function questionFromData(id: string, data: DocumentData): EvaluationQuestion {
  const responseType = stringValue(data.responseType);
  return {
    id,
    templateId: stringValue(data.templateId) || "standard-course-evaluation-v1",
    section: stringValue(data.section) || "General",
    text: stringValue(data.text),
    sortOrder: numberValue(data.sortOrder),
    responseType: (["rating", "yesNo", "multipleChoice", "text"].includes(responseType)
      ? responseType
      : "rating") as EvaluationQuestionType,
    required: data.required !== false,
    status: data.status === "inactive" ? "inactive" : "active",
    version: Math.max(1, numberValue(data.version, 1)),
    scaleMin: numberValue(data.scaleMin, 1),
    scaleMax: numberValue(data.scaleMax, 5),
    scaleMinLabel: stringValue(data.scaleMinLabel),
    scaleMaxLabel: stringValue(data.scaleMaxLabel),
    options: Array.isArray(data.options)
      ? data.options.map(String).map((item) => item.trim()).filter(Boolean)
      : [],
    createdAt: stringValue(data.createdAt),
    updatedAt: stringValue(data.updatedAt)
  };
}

function sessionFromData(id: string, data: DocumentData): EvaluationSession {
  const status = stringValue(data.status);
  return {
    id,
    token: stringValue(data.token),
    courseName: stringValue(data.courseName),
    trainerName: stringValue(data.trainerName),
    trainerEmail: stringValue(data.trainerEmail),
    trainingDate: stringValue(data.trainingDate),
    location: stringValue(data.location),
    status: (["draft", "open", "closed"].includes(status)
      ? status
      : "draft") as EvaluationSessionStatus,
    opensAt: stringValue(data.opensAt),
    closesAt: stringValue(data.closesAt),
    createdByName: stringValue(data.createdByName),
    createdByEmail: stringValue(data.createdByEmail),
    createdAt: stringValue(data.createdAt),
    updatedAt: stringValue(data.updatedAt),
    responseCount: numberValue(data.responseCount)
  };
}

function responseFromData(id: string, data: DocumentData): EvaluationResponse {
  const ratings = Object.fromEntries(
    evaluationRatingFields.map((field) => [field, numberValue(data[field])])
  ) as Record<EvaluationRatingField, number>;
  const recommendation = stringValue(data.recommendTraining);
  return {
    id,
    sessionId: stringValue(data.sessionId),
    studentName: stringValue(data.studentName),
    company: stringValue(data.company),
    recommendTraining:
      recommendation === "yes" || recommendation === "no"
        ? recommendation
        : "",
    mostUseful: stringValue(data.mostUseful),
    improvements: stringValue(data.improvements),
    additionalComments: stringValue(data.additionalComments),
    submittedAt: stringValue(data.submittedAt),
    ...ratings
  };
}

async function requireAdmin(): Promise<AdminActor> {
  if (cachedActor && cachedActor.expiresAt > Date.now()) return cachedActor.actor;
  await firebaseAuth.authStateReady();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Your Firebase session has expired. Please sign in again.");
  const profile = await getDoc(doc(firestore, "users", user.uid));
  const data = profile.data();
  if (!profile.exists() || data?.status !== "active" || data?.role !== "admin") {
    throw new Error("Administrator access is required.");
  }
  const actor: AdminActor = {
    uid: user.uid,
    name: stringValue(data.name) || user.displayName || "Administrator",
    email: stringValue(data.email) || user.email || "",
    role: "admin"
  };
  cachedActor = { actor, expiresAt: Date.now() + 120_000 };
  return actor;
}

function summaryForResponses(responses: EvaluationResponse[]): EvaluationResponseSummary {
  const averages = Object.fromEntries(
    evaluationRatingFields.map((field) => {
      const values = responses.map((item) => item[field]).filter((value) => value > 0);
      const average = values.length
        ? values.reduce((total, value) => total + value, 0) / values.length
        : 0;
      return [field, Number(average.toFixed(2))];
    })
  ) as Record<EvaluationRatingField, number>;
  const recommendations = responses.filter((item) => item.recommendTraining);
  const recommendPercentage = recommendations.length
    ? (recommendations.filter((item) => item.recommendTraining === "yes").length /
        recommendations.length) *
      100
    : 0;
  return {
    responseCount: responses.length,
    averages,
    recommendPercentage: Number(recommendPercentage.toFixed(1))
  };
}

export async function fetchFirebaseEvaluationQuestions() {
  await requireAdmin();
  const snapshot = await getDocs(collection(firestore, "evaluationQuestions"));
  return snapshot.docs
    .map((item) => questionFromData(item.id, item.data()))
    .sort((first, second) =>
      first.sortOrder - second.sortOrder || first.text.localeCompare(second.text)
    );
}

async function questionsForSession(sessionId: string) {
  const snapshot = await getDocs(collection(firestore, "evaluationSessionQuestions"));
  return snapshot.docs
    .filter((item) => stringValue(item.data().sessionId) === sessionId)
    .map((item) => questionFromData(stringValue(item.data().questionId) || item.id, item.data()))
    .sort((first, second) => first.sortOrder - second.sortOrder);
}

function publicQuestion(question: EvaluationQuestion) {
  return {
    id: question.id,
    section: question.section,
    text: question.text,
    sortOrder: question.sortOrder,
    responseType: question.responseType,
    required: question.required,
    scaleMin: question.scaleMin,
    scaleMax: question.scaleMax,
    scaleMinLabel: question.scaleMinLabel,
    scaleMaxLabel: question.scaleMaxLabel,
    options: question.options
  };
}

function publicSession(session: EvaluationSession, questions: EvaluationQuestion[]) {
  return {
    sessionId: session.id,
    courseName: session.courseName,
    trainerName: session.trainerName,
    trainingDate: session.trainingDate,
    location: session.location,
    status: session.status,
    opensAt: session.opensAt,
    closesAt: session.closesAt,
    questions: questions.map(publicQuestion),
    updatedAt: session.updatedAt,
    schemaVersion: 2
  };
}

export async function fetchFirebaseEvaluationDashboard(): Promise<EvaluationDashboard> {
  const [sessions, responses] = await Promise.all([allSessions(), allResponses()]);
  const ratings = responses.flatMap((response) =>
    evaluationRatingFields.map((field) => response[field]).filter((value) => value > 0)
  );
  return {
    totalSessions: sessions.length,
    openSessions: sessions.filter((item) => item.status === "open").length,
    closedSessions: sessions.filter((item) => item.status === "closed").length,
    totalResponses: responses.length,
    averageRating: ratings.length
      ? ratings.reduce((total, value) => total + value, 0) / ratings.length
      : 0
  };
}

export async function saveFirebaseEvaluationSession(input: EvaluationSessionInput) {
  const actor = await requireAdmin();
  const id = input.id.trim() || crypto.randomUUID();
  const reference = doc(firestore, "evaluationSessions", id);
  const existingSnapshot = await getDoc(reference);
  const previous = existingSnapshot.exists()
    ? sessionFromData(existingSnapshot.id, existingSnapshot.data())
    : null;
  let questions = previous ? await questionsForSession(id) : [];
  const hasQuestionSnapshot = questions.length > 0;
  if (!questions.length) {
    questions = (await fetchFirebaseEvaluationQuestions()).filter(
      (question) => question.status === "active"
    );
  }
  if (!questions.length) throw new Error("Activate at least one evaluation question first.");
  const now = new Date().toISOString();
  const session: EvaluationSession = {
    ...input,
    id,
    token: previous?.token || crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""),
    courseName: input.courseName.trim(),
    trainerName: input.trainerName.trim(),
    trainerEmail: input.trainerEmail.trim().toLowerCase(),
    location: input.location.trim(),
    createdByName: previous?.createdByName || actor.name,
    createdByEmail: previous?.createdByEmail || actor.email,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    responseCount: previous?.responseCount || 0
  };
  const batch = writeBatch(firestore);
  batch.set(reference, {
    ...session,
    courseNameLower: session.courseName.toLowerCase(),
    trainerNameLower: session.trainerName.toLowerCase(),
    templateId: "standard-course-evaluation-v1",
    source: previous ? existingSnapshot.data()?.source || "firebase-live" : "firebase-live",
    schemaVersion: 2
  });
  if (!previous || !hasQuestionSnapshot) {
    questions.forEach((question) => {
      batch.set(doc(firestore, "evaluationSessionQuestions", `${id}__${question.id}`), {
        ...question,
        sessionId: id,
        questionId: question.id,
        schemaVersion: 2
      });
    });
  }
  batch.set(doc(firestore, "evaluationPublicSessions", session.token), publicSession(session, questions));
  addFirebaseAuditToBatch(batch, {
    actorUserId: actor.uid,
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: previous ? "EVALUATION_SESSION_UPDATED" : "EVALUATION_SESSION_CREATED",
    entityType: "evaluation",
    entityId: id,
    entityName: `${session.courseName} - ${session.trainingDate}`,
    previousValue: previous,
    updatedValue: session
  });
  await batch.commit();
  return session;
}

export async function ensureFirebaseEvaluationPublicSession(session: EvaluationSession) {
  await requireAdmin();
  const questions = await questionsForSession(session.id);
  if (!questions.length) throw new Error("This session has no question snapshot.");
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, "evaluationPublicSessions", session.token), publicSession(session, questions));
  await batch.commit();
}

export async function closeFirebaseEvaluationSession(sessionId: string) {
  const actor = await requireAdmin();
  const reference = doc(firestore, "evaluationSessions", sessionId);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) throw new Error("Evaluation session not found.");
  const previous = sessionFromData(snapshot.id, snapshot.data());
  const updated: EvaluationSession = { ...previous, status: "closed", updatedAt: new Date().toISOString() };
  const questions = await questionsForSession(sessionId);
  const batch = writeBatch(firestore);
  batch.set(reference, { ...snapshot.data(), ...updated });
  batch.set(doc(firestore, "evaluationPublicSessions", updated.token), publicSession(updated, questions));
  addFirebaseAuditToBatch(batch, {
    actorUserId: actor.uid, actorName: actor.name, actorEmail: actor.email,
    actorRole: actor.role, action: "EVALUATION_SESSION_CLOSED",
    entityType: "evaluation", entityId: sessionId,
    entityName: `${updated.courseName} - ${updated.trainingDate}`,
    previousValue: previous, updatedValue: updated
  });
  await batch.commit();
  return updated;
}

export async function saveFirebaseEvaluationQuestion(input: EvaluationQuestionInput) {
  const actor = await requireAdmin();
  const id = input.id.trim() || crypto.randomUUID();
  const reference = doc(firestore, "evaluationQuestions", id);
  const existing = await getDoc(reference);
  const previous = existing.exists()
    ? questionFromData(existing.id, existing.data())
    : null;
  const now = new Date().toISOString();
  const question: EvaluationQuestion = {
    ...input,
    id,
    templateId: input.templateId || "standard-course-evaluation-v1",
    section: input.section.trim(),
    text: input.text.trim(),
    options: input.options.map((item) => item.trim()).filter(Boolean),
    version: previous ? previous.version + 1 : 1,
    createdAt: previous?.createdAt || now,
    updatedAt: now
  };
  const batch = writeBatch(firestore);
  batch.set(reference, { ...question, schemaVersion: 2 });
  addFirebaseAuditToBatch(batch, {
    actorUserId: actor.uid,
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: previous
      ? "EVALUATION_QUESTION_UPDATED"
      : "EVALUATION_QUESTION_CREATED",
    entityType: "evaluationMasterData",
    entityId: id,
    entityName: question.text,
    previousValue: previous,
    updatedValue: question
  });
  await batch.commit();
  return question;
}

export async function deleteFirebaseEvaluationQuestion(questionId: string) {
  const actor = await requireAdmin();
  const reference = doc(firestore, "evaluationQuestions", questionId);
  const existing = await getDoc(reference);
  if (!existing.exists()) return;
  const previous = questionFromData(existing.id, existing.data());
  const batch = writeBatch(firestore);
  batch.delete(reference);
  addFirebaseAuditToBatch(batch, {
    actorUserId: actor.uid,
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "EVALUATION_QUESTION_DELETED",
    entityType: "evaluationMasterData",
    entityId: questionId,
    entityName: previous.text,
    previousValue: previous,
    updatedValue: null,
    details: { historicalSessionQuestionsRetained: true }
  });
  await batch.commit();
}

async function allSessions() {
  await requireAdmin();
  const snapshot = await getDocs(collection(firestore, "evaluationSessions"));
  return snapshot.docs.map((item) => sessionFromData(item.id, item.data()));
}

async function allResponses(sessionId?: string) {
  await requireAdmin();
  const snapshot = await getDocs(collection(firestore, "evaluationResponses"));
  return snapshot.docs
    .map((item) => responseFromData(item.id, item.data()))
    .filter((item) => !sessionId || item.sessionId === sessionId)
    .sort((first, second) => second.submittedAt.localeCompare(first.submittedAt));
}

export async function fetchFirebaseEvaluationSessionsPage(request: {
  page?: number;
  pageSize?: number;
  query?: string;
  status?: EvaluationSessionStatus | "";
  year?: string;
}): Promise<EvaluationSessionsPage> {
  const queryText = stringValue(request.query).trim().toLowerCase();
  const responses = await allResponses();
  const responseCounts = new Map<string, number>();
  responses.forEach((response) =>
    responseCounts.set(response.sessionId, (responseCounts.get(response.sessionId) || 0) + 1)
  );
  const sessions = (await allSessions())
    .map((session) => ({
      ...session,
      responseCount: responseCounts.get(session.id) || session.responseCount || 0
    }))
    .filter((session) => !request.status || session.status === request.status)
    .filter((session) => !request.year || session.trainingDate.startsWith(request.year))
    .filter((session) =>
      !queryText ||
      `${session.courseName} ${session.trainerName} ${session.location}`
        .toLowerCase()
        .includes(queryText)
    )
    .sort((first, second) =>
      second.trainingDate.localeCompare(first.trainingDate) ||
      second.updatedAt.localeCompare(first.updatedAt)
    );
  const pageSize = Math.max(1, Math.min(numberValue(request.pageSize, 10), 100));
  const totalPages = Math.max(1, Math.ceil(sessions.length / pageSize));
  const page = Math.max(1, Math.min(numberValue(request.page, 1), totalPages));
  return {
    sessions: sessions.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    totalRecords: sessions.length,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages
  };
}

export async function fetchFirebaseEvaluationResponsesPage(request: {
  sessionId: string;
  page?: number;
  pageSize?: number;
  query?: string;
}): Promise<EvaluationResponsesPage> {
  const queryText = stringValue(request.query).trim().toLowerCase();
  const all = await allResponses(request.sessionId);
  const responses = all.filter(
    (response) =>
      !queryText ||
      `${response.studentName} ${response.company} ${response.additionalComments}`
        .toLowerCase()
        .includes(queryText)
  );
  const pageSize = Math.max(1, Math.min(numberValue(request.pageSize, 10), 100));
  const totalPages = Math.max(1, Math.ceil(responses.length / pageSize));
  const page = Math.max(1, Math.min(numberValue(request.page, 1), totalPages));
  return {
    responses: responses.slice((page - 1) * pageSize, page * pageSize),
    summary: summaryForResponses(all),
    page,
    pageSize,
    totalRecords: responses.length,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages
  };
}

export async function fetchAllFirebaseEvaluationResponses(sessionId: string) {
  const responses = await allResponses(sessionId);
  const [questions, answerSnapshot] = await Promise.all([
    questionsForSession(sessionId),
    getDocs(query(collection(firestore, "evaluationAnswers"), where("sessionId", "==", sessionId)))
  ]);
  const answers: EvaluationAnswer[] = answerSnapshot.docs.map((item) => ({
    responseId: stringValue(item.data().responseId),
    questionId: stringValue(item.data().questionId),
    rating: numberValue(item.data().rating),
    value: stringValue(item.data().value)
  }));
  return { responses, summary: summaryForResponses(responses), questions, answers };
}
