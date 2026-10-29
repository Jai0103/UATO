export type FlightActivityType =
  | "practical_training"
  | "practical_assessment"
  | "proficiency_check"
  | "refresher_training"
  | "other";

export type FlightActivityResult =
  | "not_applicable"
  | "passed"
  | "failed"
  | "incomplete";

export type FlightActivityClassification = {
  activityType: FlightActivityType;
  activityResult: FlightActivityResult;
  source: "structured" | "historical_remarks" | "default_training" | "unclassified";
  needsReview: boolean;
};

export const flightActivityOptions: Array<{ value: FlightActivityType; label: string }> = [
  { value: "practical_training", label: "Practical Training" },
  { value: "practical_assessment", label: "Practical Assessment" },
  { value: "proficiency_check", label: "Proficiency Check" },
  { value: "refresher_training", label: "Refresher / Remedial Training" },
  { value: "other", label: "Other" }
];

export const flightResultOptions: Array<{ value: FlightActivityResult; label: string }> = [
  { value: "not_applicable", label: "Not applicable" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "incomplete", label: "Incomplete" }
];

const activityTypes = new Set<FlightActivityType>(
  flightActivityOptions.map((option) => option.value)
);
const activityResults = new Set<FlightActivityResult>(
  flightResultOptions.map((option) => option.value)
);

function normalizedRemarks(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyHistoricalFlightRemarks(remarks: unknown): FlightActivityClassification {
  const value = normalizedRemarks(remarks);
  const practicalAssessment = /\b(?:practical\s+)?assess?ment\b/.test(value);
  const proficiencyCheck = /\bproficiency\s+check\b/.test(value);

  if (!practicalAssessment && !proficiencyCheck) {
    return {
      activityType: "practical_training",
      activityResult: "not_applicable",
      source: "default_training",
      needsReview: false
    };
  }

  if (practicalAssessment && proficiencyCheck) {
    return {
      activityType: "other",
      activityResult: "incomplete",
      source: "unclassified",
      needsReview: true
    };
  }

  const passed = /\bpass(?:ed)?\b/.test(value);
  const failed = /\b(?:fail(?:ed)?|faield)\b/.test(value);
  const activityType: FlightActivityType = practicalAssessment
    ? "practical_assessment"
    : "proficiency_check";

  if (passed === failed) {
    return {
      activityType,
      activityResult: "incomplete",
      source: "unclassified",
      needsReview: true
    };
  }

  return {
    activityType,
    activityResult: passed ? "passed" : "failed",
    source: "historical_remarks",
    needsReview: false
  };
}

export function resolveFlightActivity(input: {
  activityType?: unknown;
  activityResult?: unknown;
  remarks?: unknown;
}): FlightActivityClassification {
  const activityType = String(input.activityType || "") as FlightActivityType;
  const activityResult = String(input.activityResult || "") as FlightActivityResult;

  if (activityTypes.has(activityType)) {
    const assessment = activityType === "practical_assessment" || activityType === "proficiency_check";
    const validResult = activityResults.has(activityResult)
      ? activityResult
      : assessment
        ? "incomplete"
        : "not_applicable";
    return {
      activityType,
      activityResult: validResult,
      source: "structured",
      needsReview: assessment && validResult === "incomplete"
    };
  }

  return classifyHistoricalFlightRemarks(input.remarks);
}

export function flightActivityLabel(value: FlightActivityType) {
  return flightActivityOptions.find((option) => option.value === value)?.label || "Other";
}

export function flightResultLabel(value: FlightActivityResult) {
  return flightResultOptions.find((option) => option.value === value)?.label || "Incomplete";
}
