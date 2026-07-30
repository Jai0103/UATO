import {
  googleAppsScriptUrl,
  invalidateGoogleApiCache,
  postToGoogle,
} from "@/lib/google-api";

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
};

export type PublicEvaluationSubmission = {
  token: string;
  submissionKey: string;
  formStartedAt: number;
  studentName: string;
  company: string;
  ratings: EvaluationRatings;
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

async function postPublicEvaluation<T>(
  payload: Record<string, unknown>
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(googleAppsScriptUrl, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch {
    throw new EvaluationApiError(
      "Unable to connect. Check your internet connection and try again."
    );
  }

  let data: ApiEnvelope<T>;

  try {
    data = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new EvaluationApiError(
      "The evaluation service returned an invalid response."
    );
  }

  if (!response.ok || data.ok === false || data.success === false) {
    throw new EvaluationApiError(
      data.error || data.message || "The evaluation request failed."
    );
  }

  return data as T;
}

export async function fetchPublicEvaluationSession(
  token: string,
  submissionKey: string
) {
  const data = await postPublicEvaluation<{
    session: PublicEvaluationSession;
  }>({
    action: "getPublicEvaluationSession",
    token,
    submissionKey,
  });

  return data.session;
}

export async function submitPublicEvaluation(
  submission: PublicEvaluationSubmission
) {
  const data = await postPublicEvaluation<{
    submission: PublicEvaluationReceipt;
  }>({
    action: "submitPublicEvaluation",
    ...submission,
  });

  return data.submission;
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
