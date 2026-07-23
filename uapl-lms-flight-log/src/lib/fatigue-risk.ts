export type FatigueResponseValue = "" | "yes" | "no";

export type FatigueRiskSectionId =
  | "mental_physical"
  | "scheduling"
  | "work_time"
  | "environment";

export type FatigueRiskQuestion = {
  id: string;
  sectionId: FatigueRiskSectionId;
  sectionLabel: string;
  question: string;
  sortOrder: number;
};

export type FatigueRiskResponse = {
  questionId: string;
  response: FatigueResponseValue;
};

export type FatigueRiskRecord = {
  id: string;
  assessmentDate: string;
  instructorName: string;
  instructorEmail: string;
  responses: FatigueRiskResponse[];
  recommendation: string;
  evaluatedBy: string;
  evaluatorPosition: string;
  signatureDataUrl: string;
  status: "submitted" | "reviewed";
  createdAt: string;
  updatedAt: string;
};

export type FatigueRiskRecordSummary = Omit<
  FatigueRiskRecord,
  "responses" | "signatureDataUrl"
> & {
  riskCount: number;
  answeredCount: number;
  totalQuestions: number;
  signatureCaptured: boolean;
};

export const FATIGUE_RISK_SECTIONS: Array<{
  id: FatigueRiskSectionId;
  label: string;
}> = [
  {
    id: "mental_physical",
    label: "Mental and physical work demands"
  },
  {
    id: "scheduling",
    label: "Work scheduling and planning"
  },
  {
    id: "work_time",
    label: "Work time"
  },
  {
    id: "environment",
    label: "Environmental conditions"
  }
];

export const FATIGUE_RISK_QUESTIONS: FatigueRiskQuestion[] = [
  {
    id: "physical-demand",
    sectionId: "mental_physical",
    sectionLabel: "Mental and physical work demands",
    sortOrder: 1,
    question:
      "Do you carry out work for long periods which is physically demanding? (For example, tasks which are especially tiring and repetitive such as process work or moving heavy equipment or materials.)"
  },
  {
    id: "mental-demand",
    sectionId: "mental_physical",
    sectionLabel: "Mental and physical work demands",
    sortOrder: 2,
    question:
      "Do you carry out work for long periods which is mentally demanding? (For example, work requiring vigilance or continuous concentration, work performed under pressure or to tight deadlines, emergency call-outs, or interacting with the public.)"
  },
  {
    id: "midnight-travel",
    sectionId: "scheduling",
    sectionLabel: "Work scheduling and planning",
    sortOrder: 3,
    question: "Do you consistently work or travel between midnight and 6 am?"
  },
  {
    id: "weekly-day-off",
    sectionId: "scheduling",
    sectionLabel: "Work scheduling and planning",
    sortOrder: 4,
    question:
      "Does your work schedule prevent you from having at least one full day off per week?"
  },
  {
    id: "consecutive-sleep",
    sectionId: "scheduling",
    sectionLabel: "Work scheduling and planning",
    sortOrder: 5,
    question:
      "Does your schedule make it difficult to consistently have at least two consecutive nights of sleep per week?"
  },
  {
    id: "on-call",
    sectionId: "scheduling",
    sectionLabel: "Work scheduling and planning",
    sortOrder: 6,
    question:
      "Do your work practices include on-call work, call-backs, or sleepovers?"
  },
  {
    id: "scheduled-hours-differ",
    sectionId: "scheduling",
    sectionLabel: "Work scheduling and planning",
    sortOrder: 7,
    question: "Does your schedule differ from the hours actually worked?"
  },
  {
    id: "rotating-shifts",
    sectionId: "scheduling",
    sectionLabel: "Work scheduling and planning",
    sortOrder: 8,
    question: "Does your work schedule include rotating shifts?"
  },
  {
    id: "commute-over-hour",
    sectionId: "scheduling",
    sectionLabel: "Work scheduling and planning",
    sortOrder: 9,
    question: "Do you have to travel more than one hour to get to your job?"
  },
  {
    id: "over-twelve-hours",
    sectionId: "work_time",
    sectionLabel: "Work time",
    sortOrder: 10,
    question:
      "Do you work in excess of 12 hours regularly, including overtime?"
  },
  {
    id: "break-under-ten-hours",
    sectionId: "work_time",
    sectionLabel: "Work time",
    sortOrder: 11,
    question:
      "Do you have less than 10 hours of break between each shift? (For example, split shifts or quick shift changeovers.)"
  },
  {
    id: "low-body-clock",
    sectionId: "work_time",
    sectionLabel: "Work time",
    sortOrder: 12,
    question:
      "Is work performed at low body-clock times, between 2 am and 6 am?"
  },
  {
    id: "harsh-conditions",
    sectionId: "environment",
    sectionLabel: "Environmental conditions",
    sortOrder: 13,
    question:
      "Is work carried out in harsh or uncomfortable conditions? (For example, hot, humid, or cold temperatures.)"
  },
  {
    id: "vibration",
    sectionId: "environment",
    sectionLabel: "Environmental conditions",
    sortOrder: 14,
    question: "Do you work with plant or machinery that vibrates?"
  },
  {
    id: "hazardous-chemicals",
    sectionId: "environment",
    sectionLabel: "Environmental conditions",
    sortOrder: 15,
    question: "Do you work with hazardous chemicals?"
  },
  {
    id: "loud-noise",
    sectionId: "environment",
    sectionLabel: "Environmental conditions",
    sortOrder: 16,
    question: "Are you consistently exposed to loud noise?"
  }
];

function dateToInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function currentWeekMonday(date = new Date()) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = monday.getDay();
  monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
  return dateToInputValue(monday);
}

export function isMondayDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getDay() === 1
  );
}

export function createFatigueResponses(
  saved: FatigueRiskResponse[] = []
) {
  const existing = new Map(
    saved.map((response) => [response.questionId, response.response])
  );

  return FATIGUE_RISK_QUESTIONS.map((question) => ({
    questionId: question.id,
    response: existing.get(question.id) || ""
  })) satisfies FatigueRiskResponse[];
}

export function createEmptyFatigueRiskRecord(
  instructorName = "",
  instructorEmail = "",
  evaluatedBy = ""
): FatigueRiskRecord {
  return {
    id: "",
    assessmentDate: currentWeekMonday(),
    instructorName,
    instructorEmail,
    responses: createFatigueResponses(),
    recommendation: "",
    evaluatedBy,
    evaluatorPosition: "Head of Training",
    signatureDataUrl: "",
    status: "submitted",
    createdAt: "",
    updatedAt: ""
  };
}

export function countFatigueRisks(responses: FatigueRiskResponse[]) {
  return responses.filter((response) => response.response === "yes").length;
}
