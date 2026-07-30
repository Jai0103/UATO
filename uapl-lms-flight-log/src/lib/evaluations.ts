import { googleAppsScriptUrl } from "@/lib/google-api";

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
