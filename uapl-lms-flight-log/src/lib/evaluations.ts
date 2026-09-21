import {
  googleAppsScriptUrl,
  invalidateGoogleApiCache,
  postToGoogle,
} from "@/lib/google-api";
import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "@/lib/firebase-client";

export const evaluationRatingFields = [
  "objectivesClear",
  "materialsEffective",
  "trainerKnowledge",
  "theoryDelivery",
  "practicalInstruction",
  "equipmentFacilities",
  "safetyGuidance",
  "overallSatisfaction",
] as const;

export type EvaluationRatingField =
  (typeof evaluationRatingFields)[number];

export type EvaluationRatings = Record<EvaluationRatingField, number>;

export type PublicEvaluationSession = {
  id: string;
  courseName: string;
  trainerName: string;
  trainingDate: string;
  location: string;
  status: "draft" | "open" | "closed";
  available: boolean;
  unavailableReason: string;
  alreadySubmitted: boolean;
  questions: PublicEvaluationQuestion[];
};

export type PublicEvaluationQuestion = {
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

export type PublicEvaluationAnswer = {
  questionId: string;
  rating?: number;
  value?: string;
};

export type PublicEvaluationSubmission = {
  token: string;
  submissionKey: string;
  formStartedAt: number;
  studentName: string;
  company: string;
  trainingComponent?: "Theory" | "Practical" | "Both";
  theoryDeliveryMode?: "In person" | "Online synchronous";
  ratings: EvaluationRatings;
  answers: PublicEvaluationAnswer[];
  recommendTraining: "yes" | "no";
  mostUseful: string;
  improvements: string;
  additionalComments: string;
  website: string;
};

export type PublicEvaluationReceipt = {
  responseId: string;
  submittedAt: string;
  message: string;
};

export type EvaluationSessionStatus = "draft" | "open" | "closed";

export type EvaluationSession = {
  id: string;
  token: string;
  courseName: string;
  trainerName: string;
  trainerEmail: string;
  trainingDate: string;
  location: string;
  status: EvaluationSessionStatus;
  opensAt: string;
  closesAt: string;
  createdByName: string;
  createdByEmail: string;
  createdAt: string;
  updatedAt: string;
  responseCount: number;
};

export type EvaluationSessionInput = Pick<
  EvaluationSession,
  | "id"
  | "courseName"
  | "trainerName"
  | "trainerEmail"
  | "trainingDate"
  | "location"
  | "status"
  | "opensAt"
  | "closesAt"
>;

export type EvaluationDashboard = {
  totalSessions: number;
  openSessions: number;
  closedSessions: number;
  totalResponses: number;
  averageRating: number;
};

export type EvaluationSessionsPage = {
  sessions: EvaluationSession[];
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export type EvaluationResponse = {
  id: string;
  sessionId: string;
  studentName: string;
  company: string;
  trainingComponent?: string;
  theoryDeliveryMode?: string;
  recommendTraining: "" | "yes" | "no";
  mostUseful: string;
  improvements: string;
  additionalComments: string;
  submittedAt: string;
} & EvaluationRatings;

export type EvaluationResponseSummary = {
  responseCount: number;
  averages: EvaluationRatings;
  recommendPercentage: number;
};

export type EvaluationResponsesPage = {
  responses: EvaluationResponse[];
  summary: EvaluationResponseSummary;
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

type ApiEnvelope<T> = {
  ok?: boolean;
  success?: boolean;
  error?: string;
  message?: string;
} & T;

export class EvaluationApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationApiError";
  }
}

function publicFunctionError(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return new EvaluationApiError(
      error instanceof Error ? error.message : "The evaluation request failed."
    );
  }
  const message = String(error.message || "")
    .replace(/^Firebase:\s*/i, "")
    .replace(/\s*\(functions\/[^)]+\)\.?$/i, "")
    .trim();
  return new EvaluationApiError(message || "The evaluation request failed.");
}

export async function fetchPublicEvaluationSession(
  token: string,
  submissionKey: string
) {
  try {
    const callable = httpsCallable<
      { token: string; submissionKey: string },
      { session: PublicEvaluationSession }
    >(firebaseFunctions, "getPublicEvaluation");
    const result = await callable({ token, submissionKey });
    return result.data.session;
  } catch (error) {
    throw publicFunctionError(error);
  }
}

export async function submitPublicEvaluation(
  submission: PublicEvaluationSubmission
) {
  try {
    const callable = httpsCallable<
      PublicEvaluationSubmission,
      { submission: PublicEvaluationReceipt }
    >(firebaseFunctions, "submitPublicEvaluation");
    const result = await callable(submission);
    return result.data.submission;
  } catch (error) {
    throw publicFunctionError(error);
  }
}

export async function fetchEvaluationDashboard() {
  const data = await postToGoogle<{
    dashboard: EvaluationDashboard;
  }>({
    action: "getEvaluationDashboard",
  });

  return data.dashboard;
}

export async function fetchEvaluationSessionsPage(request: {
  page?: number;
  pageSize?: number;
  query?: string;
  status?: EvaluationSessionStatus | "";
  year?: string;
}) {
  return postToGoogle<EvaluationSessionsPage>({
    action: "getEvaluationSessionsPage",
    ...request,
  });
}

export async function fetchEvaluationSession(sessionId: string) {
  const data = await postToGoogle<{
    session: EvaluationSession;
  }>({
    action: "getEvaluationSession",
    sessionId,
  });

  return data.session;
}

export async function saveEvaluationSession(
  session: EvaluationSessionInput
) {
  const data = await postToGoogle<{
    session: EvaluationSession;
  }>({
    action: "saveEvaluationSession",
    session,
  });

  invalidateGoogleApiCache();
  return data.session;
}

export async function closeEvaluationSession(sessionId: string) {
  const data = await postToGoogle<{
    session: EvaluationSession;
  }>({
    action: "closeEvaluationSession",
    sessionId,
  });

  invalidateGoogleApiCache();
  return data.session;
}

export async function fetchEvaluationResponsesPage(request: {
  sessionId: string;
  page?: number;
  pageSize?: number;
  query?: string;
}) {
  return postToGoogle<EvaluationResponsesPage>({
    action: "getEvaluationResponsesPage",
    ...request,
  });
}

export async function fetchAllEvaluationResponses(sessionId: string) {
  const firstPage = await fetchEvaluationResponsesPage({
    sessionId,
    page: 1,
    pageSize: 25,
    query: "",
  });
  const responses = [...firstPage.responses];

  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const nextPage = await fetchEvaluationResponsesPage({
      sessionId,
      page,
      pageSize: 25,
      query: "",
    });
    responses.push(...nextPage.responses);
  }

  return {
    responses,
    summary: firstPage.summary,
  };
}
