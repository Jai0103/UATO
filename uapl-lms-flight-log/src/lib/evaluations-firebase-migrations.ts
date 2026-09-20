"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  type DocumentData,
  type DocumentReference
} from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase-client";
import {
  evaluationRatingFields,
  fetchAllEvaluationResponses,
  fetchEvaluationSessionsPage,
  type EvaluationRatingField,
  type EvaluationResponse,
  type EvaluationSession
} from "@/lib/evaluations";

const BATCH_SIZE = 350;
const TEMPLATE_ID = "standard-course-evaluation-v1";

export type EvaluationMigrationProgress = {
  label: string;
  current: number;
  total: number;
};

export type EvaluationQuestionDefinition = {
  id: EvaluationRatingField;
  section: string;
  text: string;
  sortOrder: number;
  responseType: "rating";
  required: true;
  status: "active";
  version: 1;
  scaleMin: 1;
  scaleMax: 5;
  scaleMinLabel: string;
  scaleMaxLabel: string;
};

export type EvaluationMigrationSource = {
  sessions: EvaluationSession[];
  responsesBySession: Record<string, EvaluationResponse[]>;
};

export type EvaluationMigrationAnalysis = EvaluationMigrationSource & {
  questions: EvaluationQuestionDefinition[];
  sessionCount: number;
  responseCount: number;
  answerCount: number;
  sessionQuestionCount: number;
};

export type EvaluationMigrationVerification = {
  verified: boolean;
  expected: Record<string, number>;
  actual: Record<string, number>;
  mismatches: string[];
};

type FirestoreOperation = {
  reference: DocumentReference<DocumentData>;
  data: DocumentData;
};

export const defaultEvaluationQuestions: EvaluationQuestionDefinition[] = [
  {
    id: "objectivesClear",
    section: "Course Content",
    text: "The course objectives were clear and achieved.",
    sortOrder: 0,
    responseType: "rating",
    required: true,
    status: "active",
    version: 1,
    scaleMin: 1,
    scaleMax: 5,
    scaleMinLabel: "Strongly disagree",
    scaleMaxLabel: "Strongly agree"
  },
  {
    id: "materialsEffective",
    section: "Course Content",
    text: "The training materials supported my learning effectively.",
    sortOrder: 1,
    responseType: "rating",
    required: true,
    status: "active",
    version: 1,
    scaleMin: 1,
    scaleMax: 5,
    scaleMinLabel: "Strongly disagree",
    scaleMaxLabel: "Strongly agree"
  },
  {
    id: "trainerKnowledge",
    section: "Trainer Performance",
    text: "The trainer demonstrated strong knowledge of the subject.",
    sortOrder: 2,
    responseType: "rating",
    required: true,
    status: "active",
    version: 1,
    scaleMin: 1,
    scaleMax: 5,
    scaleMinLabel: "Strongly disagree",
    scaleMaxLabel: "Strongly agree"
  },
  {
    id: "theoryDelivery",
    section: "Trainer Performance",
    text: "The theory lessons were delivered clearly and effectively.",
    sortOrder: 3,
    responseType: "rating",
    required: true,
    status: "active",
    version: 1,
    scaleMin: 1,
    scaleMax: 5,
    scaleMinLabel: "Strongly disagree",
    scaleMaxLabel: "Strongly agree"
  },
  {
    id: "practicalInstruction",
    section: "Practical Training",
    text: "The practical instruction was clear, useful, and well supervised.",
    sortOrder: 4,
    responseType: "rating",
    required: true,
    status: "active",
    version: 1,
    scaleMin: 1,
    scaleMax: 5,
    scaleMinLabel: "Strongly disagree",
    scaleMaxLabel: "Strongly agree"
  },
  {
    id: "equipmentFacilities",
    section: "Facilities and Equipment",
    text: "The equipment and facilities were suitable for the training.",
    sortOrder: 5,
    responseType: "rating",
    required: true,
    status: "active",
    version: 1,
    scaleMin: 1,
    scaleMax: 5,
    scaleMinLabel: "Very poor",
    scaleMaxLabel: "Excellent"
  },
  {
    id: "safetyGuidance",
    section: "Safety",
    text: "Safety requirements and guidance were communicated clearly.",
    sortOrder: 6,
    responseType: "rating",
    required: true,
    status: "active",
    version: 1,
    scaleMin: 1,
    scaleMax: 5,
    scaleMinLabel: "Strongly disagree",
    scaleMaxLabel: "Strongly agree"
  },
  {
    id: "overallSatisfaction",
    section: "Overall Experience",
    text: "Overall, I was satisfied with this training programme.",
    sortOrder: 7,
    responseType: "rating",
    required: true,
    status: "active",
    version: 1,
    scaleMin: 1,
    scaleMax: 5,
    scaleMinLabel: "Very dissatisfied",
    scaleMaxLabel: "Very satisfied"
  }
];

function safeId(value: string) {
  return String(value || "").trim().replace(/\//g, "_");
}

async function requireAdmin() {
  await firebaseAuth.authStateReady();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Sign in to Firebase as an administrator first.");
  const profile = await getDoc(doc(firestore, "users", user.uid));
  if (
    !profile.exists() ||
    profile.data().status !== "active" ||
    profile.data().role !== "admin"
  ) {
    throw new Error("Only an active Firebase administrator can run migration.");
  }
  return user;
}

async function commitOperations(
  operations: FirestoreOperation[],
  onProgress?: (progress: EvaluationMigrationProgress) => void
) {
  for (let start = 0; start < operations.length; start += BATCH_SIZE) {
    const batch = writeBatch(firestore);
    operations.slice(start, start + BATCH_SIZE).forEach((operation) => {
      batch.set(operation.reference, operation.data);
    });
    await batch.commit();
    onProgress?.({
      label: "Copying Evaluation data",
      current: Math.min(start + BATCH_SIZE, operations.length),
      total: operations.length
    });
  }
}

export async function loadGoogleEvaluationSource(
  onProgress?: (progress: EvaluationMigrationProgress) => void
) {
  const firstPage = await fetchEvaluationSessionsPage({
    page: 1,
    pageSize: 25,
    query: "",
    status: "",
    year: ""
  });
  const sessions = [...firstPage.sessions];

  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const nextPage = await fetchEvaluationSessionsPage({
      page,
      pageSize: 25,
      query: "",
      status: "",
      year: ""
    });
    sessions.push(...nextPage.sessions);
  }

  const responsesBySession: Record<string, EvaluationResponse[]> = {};
  for (let start = 0; start < sessions.length; start += 3) {
    const group = sessions.slice(start, start + 3);
    const results = await Promise.all(
      group.map(async (session) => ({
        sessionId: session.id,
        responses: (await fetchAllEvaluationResponses(session.id)).responses
      }))
    );
    results.forEach((result) => {
      responsesBySession[result.sessionId] = result.responses;
    });
    onProgress?.({
      label: "Loading Evaluation responses",
      current: Math.min(start + group.length, sessions.length),
      total: sessions.length
    });
  }

  return { sessions, responsesBySession } satisfies EvaluationMigrationSource;
}

export function analyzeEvaluationMigration(
  source: EvaluationMigrationSource
): EvaluationMigrationAnalysis {
  const responses = Object.values(source.responsesBySession).flat();
  return {
    ...source,
    questions: defaultEvaluationQuestions,
    sessionCount: source.sessions.length,
    responseCount: responses.length,
    answerCount: responses.length * defaultEvaluationQuestions.length,
    sessionQuestionCount:
      source.sessions.length * defaultEvaluationQuestions.length
  };
}

export async function migrateEvaluationsToFirestore(
  analysis: EvaluationMigrationAnalysis,
  actor: { uid: string; email: string },
  onProgress?: (progress: EvaluationMigrationProgress) => void
) {
  await requireAdmin();
  const operations: FirestoreOperation[] = [];

  operations.push({
    reference: doc(firestore, "evaluationTemplates", TEMPLATE_ID),
    data: {
      id: TEMPLATE_ID,
      name: "Standard Course Evaluation",
      description: "Default AGA post-course student evaluation.",
      status: "active",
      version: 1,
      questionCount: analysis.questions.length,
      updatedAt: new Date().toISOString(),
      schemaVersion: 1
    }
  });

  analysis.questions.forEach((question) => {
    operations.push({
      reference: doc(firestore, "evaluationQuestions", question.id),
      data: { ...question, templateId: TEMPLATE_ID, schemaVersion: 1 }
    });
  });

  analysis.sessions.forEach((session) => {
    const sessionId = safeId(session.id);
    operations.push({
      reference: doc(firestore, "evaluationSessions", sessionId),
      data: {
        ...session,
        id: sessionId,
        courseNameLower: session.courseName.trim().toLowerCase(),
        trainerNameLower: session.trainerName.trim().toLowerCase(),
        templateId: TEMPLATE_ID,
        questionVersion: 1,
        source: "google-migration",
        schemaVersion: 1
      }
    });

    analysis.questions.forEach((question) => {
      operations.push({
        reference: doc(
          firestore,
          "evaluationSessionQuestions",
          `${sessionId}__${question.id}`
        ),
        data: {
          ...question,
          sessionId,
          questionId: question.id,
          templateId: TEMPLATE_ID,
          schemaVersion: 1
        }
      });
    });

    (analysis.responsesBySession[session.id] || []).forEach((response) => {
      const responseId = safeId(response.id);
      operations.push({
        reference: doc(firestore, "evaluationResponses", responseId),
        data: {
          ...response,
          id: responseId,
          sessionId,
          studentNameLower: response.studentName.trim().toLowerCase(),
          source: "google-migration",
          schemaVersion: 1
        }
      });

      analysis.questions.forEach((question) => {
        operations.push({
          reference: doc(
            firestore,
            "evaluationAnswers",
            `${responseId}__${question.id}`
          ),
          data: {
            id: `${responseId}__${question.id}`,
            responseId,
            sessionId,
            questionId: question.id,
            questionText: question.text,
            section: question.section,
            responseType: question.responseType,
            rating: Number(response[question.id]) || 0,
            submittedAt: response.submittedAt,
            schemaVersion: 1
          }
        });
      });
    });
  });

  await commitOperations(operations, onProgress);
  const runId = `evaluations-${Date.now()}`;
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, "migrationRuns", runId), {
    runId,
    migrationType: "student-evaluations",
    actorUid: actor.uid,
    actorEmail: actor.email,
    createdAt: new Date().toISOString(),
    counts: {
      templates: 1,
      questions: analysis.questions.length,
      sessions: analysis.sessionCount,
      sessionQuestions: analysis.sessionQuestionCount,
      responses: analysis.responseCount,
      answers: analysis.answerCount
    },
    schemaVersion: 1
  });
  await batch.commit();
  return { runId };
}

export async function verifyEvaluationMigration(
  analysis: EvaluationMigrationAnalysis
): Promise<EvaluationMigrationVerification> {
  await requireAdmin();
  const collections = {
    templates: "evaluationTemplates",
    questions: "evaluationQuestions",
    sessions: "evaluationSessions",
    sessionQuestions: "evaluationSessionQuestions",
    responses: "evaluationResponses",
    answers: "evaluationAnswers"
  } as const;
  const snapshots = await Promise.all(
    Object.values(collections).map((name) => getDocs(collection(firestore, name)))
  );
  const actual = Object.fromEntries(
    Object.keys(collections).map((key, index) => [key, snapshots[index].size])
  );
  const expected = {
    templates: 1,
    questions: analysis.questions.length,
    sessions: analysis.sessionCount,
    sessionQuestions: analysis.sessionQuestionCount,
    responses: analysis.responseCount,
    answers: analysis.answerCount
  };
  const mismatches = Object.keys(expected)
    .filter((key) => actual[key] !== expected[key as keyof typeof expected])
    .map(
      (key) =>
        `${key}: ${actual[key]} found, ${expected[key as keyof typeof expected]} expected`
    );
  return { verified: mismatches.length === 0, expected, actual, mismatches };
}
