import { collection, doc, getDoc, getDocs, Timestamp } from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase-client";
import { evaluationRatingFields } from "@/lib/evaluations";
import { resolveFlightActivity } from "@/lib/flight-activity";

export type DashboardDateRange = {
  dateFrom: string;
  dateTo: string;
};

export type DashboardMonthPoint = {
  key: string;
  label: string;
  flightMinutes: number;
  flightCount: number;
  practicalLearners: number;
  theoryLearners: number;
  theoryPartialLearners: number;
  totalLearners: number;
  practicalAssessmentPassed: number;
  practicalAssessmentFailed: number;
  practicalAssessmentLearners: number;
  proficiencyCheckPassed: number;
  proficiencyCheckFailed: number;
  proficiencyCheckLearners: number;
  activityNeedsReview: number;
  maintenancePass: number;
  maintenanceFail: number;
  maintenanceCompliance: number;
  attendanceSessions: number;
  attendanceCoveredSessions: number;
  attendanceRate: number;
  evaluationResponses: number;
  evaluationAverage: number;
};

export type TrainerFlightHours = {
  name: string;
  minutes: number;
  flights: number;
};

export type EvaluationKpiScore = {
  name: string;
  average: number;
  ratings: number;
  responses: number;
};

export type DashboardAnalytics = {
  totals: {
    flights: number;
    flightMinutes: number;
    trainers: number;
    uniqueLearners: number;
    practicalLearners: number;
    theoryLearners: number;
    theoryPartialLearners: number;
    practicalAssessmentLearners: number;
    practicalAssessmentPassed: number;
    practicalAssessmentFailed: number;
    practicalAssessmentPassRate: number;
    proficiencyCheckLearners: number;
    proficiencyCheckPassed: number;
    proficiencyCheckFailed: number;
    proficiencyCheckPassRate: number;
    activityNeedsReview: number;
    maintenanceChecks: number;
    maintenanceCompliance: number;
    attendanceSessions: number;
    attendanceCheckIns: number;
    attendanceRate: number;
    evaluationResponses: number;
    evaluationAverage: number;
    trainerEffectiveness: number;
    courseSatisfaction: number;
    recommendationRate: number;
  };
  months: DashboardMonthPoint[];
  trainerFlightHours: TrainerFlightHours[];
  trainerEvaluationScores: EvaluationKpiScore[];
  evaluationSectionScores: EvaluationKpiScore[];
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDate(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString().slice(0, 10);
  const raw = text(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw.slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function inRange(value: string, range: DashboardDateRange) {
  const date = value.slice(0, 10);
  return Boolean(date && date >= range.dateFrom && date <= range.dateTo);
}

function monthKey(value: string) {
  return value.slice(0, 7);
}

function normalizedLearnerKey(name: unknown, lastFour: unknown, fallback = "") {
  const normalizedName = text(name)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const normalizedLastFour = text(lastFour).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalizedName && normalizedLastFour
    ? `${normalizedName}|${normalizedLastFour}`
    : fallback;
}

type MonthLearnerSets = {
  practical: Set<string>;
  theory: Set<string>;
  theoryPartial: Set<string>;
  assessments: Set<string>;
  proficiencyChecks: Set<string>;
  total: Set<string>;
};

function monthSeries(range: DashboardDateRange) {
  const start = new Date(`${range.dateFrom}T00:00:00`);
  const end = new Date(`${range.dateTo}T00:00:00`);
  const values: DashboardMonthPoint[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= last && values.length < 36) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    values.push({
      key,
      label: new Intl.DateTimeFormat("en-SG", {
        month: "short",
        year: values.length === 0 || cursor.getMonth() === 0 ? "2-digit" : undefined
      }).format(cursor),
      flightMinutes: 0,
      flightCount: 0,
      practicalLearners: 0,
      theoryLearners: 0,
      theoryPartialLearners: 0,
      totalLearners: 0,
      practicalAssessmentPassed: 0,
      practicalAssessmentFailed: 0,
      practicalAssessmentLearners: 0,
      proficiencyCheckPassed: 0,
      proficiencyCheckFailed: 0,
      proficiencyCheckLearners: 0,
      activityNeedsReview: 0,
      maintenancePass: 0,
      maintenanceFail: 0,
      maintenanceCompliance: 0,
      attendanceSessions: 0,
      attendanceCoveredSessions: 0,
      attendanceRate: 0,
      evaluationResponses: 0,
      evaluationAverage: 0
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return values;
}

async function requireAdmin() {
  await firebaseAuth.authStateReady();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Your Firebase session has expired. Please sign in again.");
  const profile = await getDoc(doc(firestore, "users", user.uid));
  if (!profile.exists() || profile.data().status !== "active" || profile.data().role !== "admin") {
    throw new Error("Administrator access is required to view dashboard analytics.");
  }
}

export async function fetchDashboardAnalytics(
  range: DashboardDateRange
): Promise<DashboardAnalytics> {
  await requireAdmin();
  const [
    flightSnapshot,
    maintenanceSnapshot,
    attendanceSessionSnapshot,
    attendanceSubmissionSnapshot,
    trainingProgrammeSnapshot,
    evaluationResponseSnapshot,
    evaluationAnswerSnapshot,
    evaluationSessionSnapshot
  ] = await Promise.all([
    getDocs(collection(firestore, "flightEntries")),
    getDocs(collection(firestore, "uaMaintenanceRecords")),
    getDocs(collection(firestore, "attendanceSessions")),
    getDocs(collection(firestore, "attendanceSubmissions")),
    getDocs(collection(firestore, "trainingProgrammes")),
    getDocs(collection(firestore, "evaluationResponses")),
    getDocs(collection(firestore, "evaluationAnswers")),
    getDocs(collection(firestore, "evaluationSessions"))
  ]);

  const months = monthSeries(range);
  const monthMap = new Map(months.map((item) => [item.key, item]));
  const trainers = new Map<string, TrainerFlightHours>();
  const monthlyLearners = new Map<string, MonthLearnerSets>(
    months.map((month) => [month.key, {
      practical: new Set<string>(),
      theory: new Set<string>(),
      theoryPartial: new Set<string>(),
      assessments: new Set<string>(),
      proficiencyChecks: new Set<string>(),
      total: new Set<string>()
    }])
  );
  const uniqueLearners = new Set<string>();
  const practicalLearners = new Set<string>();
  const theoryLearners = new Set<string>();
  const theoryPartialLearners = new Set<string>();
  const practicalAssessmentLearners = new Set<string>();
  const proficiencyCheckLearners = new Set<string>();
  const practicalAssessmentEvents = new Map<string, { monthKey: string; results: Set<"passed" | "failed"> }>();
  const proficiencyCheckEvents = new Map<string, { monthKey: string; results: Set<"passed" | "failed"> }>();
  let practicalAssessmentPassed = 0;
  let practicalAssessmentFailed = 0;
  let proficiencyCheckPassed = 0;
  let proficiencyCheckFailed = 0;
  let activityNeedsReview = 0;

  flightSnapshot.docs.forEach((item) => {
    const data = item.data();
    const date = isoDate(data.date);
    if (!inRange(date, range)) return;
    const learnerKey = normalizedLearnerKey(
      data.studentName,
      data.lastFourCharacters,
      `flight:${text(data.recordId) || item.id}`
    );
    const minutes = Math.max(0, number(data.durationMinutes));
    const trainer = text(data.instructorInCommand) || "Unassigned trainer";
    const trainerKey = trainer.toLowerCase();
    const current = trainers.get(trainerKey) || { name: trainer, minutes: 0, flights: 0 };
    current.minutes += minutes;
    current.flights += 1;
    trainers.set(trainerKey, current);
    const month = monthMap.get(monthKey(date));
    if (month) {
      month.flightMinutes += minutes;
      month.flightCount += 1;
      if (learnerKey) {
        const sets = monthlyLearners.get(month.key);
        sets?.practical.add(learnerKey);
        sets?.total.add(learnerKey);
      }
    }
    if (learnerKey) {
      practicalLearners.add(learnerKey);
      uniqueLearners.add(learnerKey);
    }
    const activity = resolveFlightActivity(data);
    if (activity.needsReview) {
      activityNeedsReview += 1;
      if (month) month.activityNeedsReview += 1;
      return;
    }
    if (activity.activityType === "practical_assessment") {
      if (learnerKey) {
        practicalAssessmentLearners.add(learnerKey);
        if (month) monthlyLearners.get(month.key)?.assessments.add(learnerKey);
      }
      if (activity.activityResult === "passed" || activity.activityResult === "failed") {
        const eventKey = `${learnerKey}|${date}`;
        const event = practicalAssessmentEvents.get(eventKey) || {
          monthKey: monthKey(date),
          results: new Set<"passed" | "failed">()
        };
        event.results.add(activity.activityResult);
        practicalAssessmentEvents.set(eventKey, event);
      }
    }
    if (activity.activityType === "proficiency_check") {
      if (learnerKey) {
        proficiencyCheckLearners.add(learnerKey);
        if (month) monthlyLearners.get(month.key)?.proficiencyChecks.add(learnerKey);
      }
      if (activity.activityResult === "passed" || activity.activityResult === "failed") {
        const eventKey = `${learnerKey}|${date}`;
        const event = proficiencyCheckEvents.get(eventKey) || {
          monthKey: monthKey(date),
          results: new Set<"passed" | "failed">()
        };
        event.results.add(activity.activityResult);
        proficiencyCheckEvents.set(eventKey, event);
      }
    }
  });

  practicalAssessmentEvents.forEach((event) => {
    const month = monthMap.get(event.monthKey);
    if (event.results.size !== 1) {
      activityNeedsReview += 1;
      if (month) month.activityNeedsReview += 1;
      return;
    }
    if (event.results.has("passed")) {
      practicalAssessmentPassed += 1;
      if (month) month.practicalAssessmentPassed += 1;
    } else {
      practicalAssessmentFailed += 1;
      if (month) month.practicalAssessmentFailed += 1;
    }
  });

  proficiencyCheckEvents.forEach((event) => {
    const month = monthMap.get(event.monthKey);
    if (event.results.size !== 1) {
      activityNeedsReview += 1;
      if (month) month.activityNeedsReview += 1;
      return;
    }
    if (event.results.has("passed")) {
      proficiencyCheckPassed += 1;
      if (month) month.proficiencyCheckPassed += 1;
    } else {
      proficiencyCheckFailed += 1;
      if (month) month.proficiencyCheckFailed += 1;
    }
  });

  maintenanceSnapshot.docs.forEach((item) => {
    const data = item.data();
    const date = isoDate(data.inspectionDate);
    if (!inRange(date, range)) return;
    const month = monthMap.get(monthKey(date));
    if (!month) return;
    month.maintenancePass += Math.max(0, number(data.passCount));
    month.maintenanceFail += Math.max(0, number(data.failCount));
  });

  const uaplTheoryProgrammeIds = new Set(
    trainingProgrammeSnapshot.docs
      .filter((item) => {
        const data = item.data();
        if (data.reportingCategory === "uapl_theory") return true;
        const legacy = `${text(data.name)} ${text(data.code)}`.toLowerCase();
        return legacy.includes("uapl") && legacy.includes("theory");
      })
      .map((item) => item.id)
  );
  const attendanceSessions = attendanceSessionSnapshot.docs
    .map((item) => {
      const data = item.data();
      const courseName = text(data.courseName);
      const legacyTheory = courseName.toLowerCase().includes("uapl") && courseName.toLowerCase().includes("theory");
      return {
        id: item.id,
        courseDate: text(data.courseDate),
        schedule: data.schedule === "am" || data.schedule === "pm" ? data.schedule : "full_day",
        isUaplTheory: uaplTheoryProgrammeIds.has(text(data.programmeId)) || legacyTheory
      };
    })
    .filter((item) => inRange(isoDate(item.courseDate), range));
  const includedAttendanceIds = new Set(attendanceSessions.map((item) => item.id));
  const attendanceCounts = new Map<string, number>();
  const attendanceLearners = new Map<string, Map<string, Set<string>>>();
  attendanceSubmissionSnapshot.docs.forEach((item) => {
    const data = item.data();
    const sessionId = text(data.sessionId);
    if (!includedAttendanceIds.has(sessionId)) return;
    attendanceCounts.set(sessionId, (attendanceCounts.get(sessionId) || 0) + 1);
    const learnerKey = normalizedLearnerKey(
      data.learnerName,
      data.lastFour,
      text(data.identityHash) ? `attendance:${text(data.identityHash)}` : `attendance:${item.id}`
    );
    if (!learnerKey) return;
    const sessionLearners = attendanceLearners.get(sessionId) || new Map<string, Set<string>>();
    const periods = sessionLearners.get(learnerKey) || new Set<string>();
    periods.add(data.period === "pm" ? "pm" : "am");
    sessionLearners.set(learnerKey, periods);
    attendanceLearners.set(sessionId, sessionLearners);
  });
  attendanceSessions.forEach((session) => {
    const month = monthMap.get(monthKey(isoDate(session.courseDate)));
    if (!month) return;
    month.attendanceSessions += 1;
    if ((attendanceCounts.get(session.id) || 0) > 0) month.attendanceCoveredSessions += 1;
    if (!session.isUaplTheory) return;
    const learners = attendanceLearners.get(session.id) || new Map<string, Set<string>>();
    learners.forEach((periods, learnerKey) => {
      const complete = session.schedule === "am"
        ? periods.has("am")
        : session.schedule === "pm"
          ? periods.has("pm")
          : periods.has("am") && periods.has("pm");
      if (!complete) {
        theoryPartialLearners.add(learnerKey);
        monthlyLearners.get(month.key)?.theoryPartial.add(learnerKey);
        return;
      }
      theoryLearners.add(learnerKey);
      uniqueLearners.add(learnerKey);
      const sets = monthlyLearners.get(month.key);
      sets?.theory.add(learnerKey);
      sets?.total.add(learnerKey);
    });
  });
  theoryLearners.forEach((learnerKey) => theoryPartialLearners.delete(learnerKey));
  monthlyLearners.forEach((sets) => {
    sets.theory.forEach((learnerKey) => sets.theoryPartial.delete(learnerKey));
  });

  const answersByResponse = new Map<string, Array<{ rating: number; section: string }>>();
  evaluationAnswerSnapshot.docs.forEach((item) => {
    const data = item.data();
    const responseId = text(data.responseId);
    const rating = number(data.rating);
    if (!responseId || rating <= 0) return;
    const values = answersByResponse.get(responseId) || [];
    values.push({ rating, section: text(data.section) || "General" });
    answersByResponse.set(responseId, values);
  });
  const evaluationTotals = new Map<string, { sum: number; count: number }>();
  const sessionById = new Map(evaluationSessionSnapshot.docs.map((item) => [item.id, item.data()]));
  const trainerScores = new Map<string, { name: string; sum: number; count: number; responses: Set<string> }>();
  const sectionScores = new Map<string, { sum: number; count: number; responses: Set<string> }>();
  let recommendationYes = 0;
  let recommendationCount = 0;
  let trainerRatingSum = 0;
  let trainerRatingCount = 0;
  let courseRatingSum = 0;
  let courseRatingCount = 0;
  evaluationResponseSnapshot.docs.forEach((item) => {
    const data = item.data();
    const date = isoDate(data.submittedAt);
    if (!inRange(date, range)) return;
    const answerDetails = answersByResponse.get(item.id) || [];
    const answerRatings = answerDetails.map((answer) => answer.rating);
    const legacyRatings = evaluationRatingFields
      .map((field) => number(data[field]))
      .filter((value) => value > 0);
    const ratings = answerRatings.length ? answerRatings : legacyRatings;
    const month = monthMap.get(monthKey(date));
    if (!month) return;
    month.evaluationResponses += 1;
    if (ratings.length) {
      const current = evaluationTotals.get(month.key) || { sum: 0, count: 0 };
      current.sum += ratings.reduce((total, value) => total + value, 0);
      current.count += ratings.length;
      evaluationTotals.set(month.key, current);
    }
    const recommendation = text(data.recommendTraining);
    if (recommendation === "yes" || recommendation === "no") {
      recommendationCount += 1;
      if (recommendation === "yes") recommendationYes += 1;
    }
    const session = sessionById.get(text(data.sessionId));
    const trainerName = text(data.trainerName) || text(session?.trainerName) || "Unassigned trainer";
    answerDetails.forEach((answer) => {
      const section = answer.section;
      const sectionCurrent = sectionScores.get(section) || { sum: 0, count: 0, responses: new Set<string>() };
      sectionCurrent.sum += answer.rating;
      sectionCurrent.count += 1;
      sectionCurrent.responses.add(item.id);
      sectionScores.set(section, sectionCurrent);
      if (section === "Trainer / Instructor") {
        trainerRatingSum += answer.rating;
        trainerRatingCount += 1;
        const key = trainerName.toLowerCase();
        const trainerCurrent = trainerScores.get(key) || { name: trainerName, sum: 0, count: 0, responses: new Set<string>() };
        trainerCurrent.sum += answer.rating;
        trainerCurrent.count += 1;
        trainerCurrent.responses.add(item.id);
        trainerScores.set(key, trainerCurrent);
      }
      if (section === "Course Content & Learning" || section === "Overall Course Evaluation") {
        courseRatingSum += answer.rating;
        courseRatingCount += 1;
      }
    });
  });

  months.forEach((month) => {
    const learnerSets = monthlyLearners.get(month.key);
    month.practicalLearners = learnerSets?.practical.size || 0;
    month.theoryLearners = learnerSets?.theory.size || 0;
    month.theoryPartialLearners = learnerSets?.theoryPartial.size || 0;
    month.practicalAssessmentLearners = learnerSets?.assessments.size || 0;
    month.proficiencyCheckLearners = learnerSets?.proficiencyChecks.size || 0;
    month.totalLearners = learnerSets?.total.size || 0;
    const maintenanceTotal = month.maintenancePass + month.maintenanceFail;
    month.maintenanceCompliance = maintenanceTotal
      ? (month.maintenancePass / maintenanceTotal) * 100
      : 0;
    const capturedTheoryLearners =
      (learnerSets?.theory.size || 0) + (learnerSets?.theoryPartial.size || 0);
    month.attendanceRate = capturedTheoryLearners
      ? ((learnerSets?.theory.size || 0) / capturedTheoryLearners) * 100
      : 0;
    const evaluation = evaluationTotals.get(month.key);
    month.evaluationAverage = evaluation?.count ? evaluation.sum / evaluation.count : 0;
  });

  const totalMaintenancePass = months.reduce((total, item) => total + item.maintenancePass, 0);
  const totalMaintenanceFail = months.reduce((total, item) => total + item.maintenanceFail, 0);
  const totalAttendanceSessions = months.reduce((total, item) => total + item.attendanceSessions, 0);
  const totalEvaluationResponses = months.reduce(
    (total, item) => total + item.evaluationResponses,
    0
  );
  const evaluationWeightedSum = months.reduce(
    (total, item) => total + item.evaluationAverage * item.evaluationResponses,
    0
  );

  return {
    totals: {
      flights: months.reduce((total, item) => total + item.flightCount, 0),
      flightMinutes: months.reduce((total, item) => total + item.flightMinutes, 0),
      trainers: trainers.size,
      uniqueLearners: uniqueLearners.size,
      practicalLearners: practicalLearners.size,
      theoryLearners: theoryLearners.size,
      theoryPartialLearners: theoryPartialLearners.size,
      practicalAssessmentLearners: practicalAssessmentLearners.size,
      practicalAssessmentPassed,
      practicalAssessmentFailed,
      practicalAssessmentPassRate: practicalAssessmentPassed + practicalAssessmentFailed
        ? practicalAssessmentPassed * 100 / (practicalAssessmentPassed + practicalAssessmentFailed)
        : 0,
      proficiencyCheckLearners: proficiencyCheckLearners.size,
      proficiencyCheckPassed,
      proficiencyCheckFailed,
      proficiencyCheckPassRate: proficiencyCheckPassed + proficiencyCheckFailed
        ? proficiencyCheckPassed * 100 / (proficiencyCheckPassed + proficiencyCheckFailed)
        : 0,
      activityNeedsReview,
      maintenanceChecks: totalMaintenancePass + totalMaintenanceFail,
      maintenanceCompliance:
        totalMaintenancePass + totalMaintenanceFail
          ? (totalMaintenancePass / (totalMaintenancePass + totalMaintenanceFail)) * 100
          : 0,
      attendanceSessions: totalAttendanceSessions,
      attendanceCheckIns: Array.from(attendanceCounts.values()).reduce(
        (total, value) => total + value,
        0
      ),
      attendanceRate: theoryLearners.size + theoryPartialLearners.size
        ? theoryLearners.size * 100 / (theoryLearners.size + theoryPartialLearners.size)
        : 0,
      evaluationResponses: totalEvaluationResponses,
      evaluationAverage: totalEvaluationResponses
        ? evaluationWeightedSum / totalEvaluationResponses
        : 0,
      trainerEffectiveness: trainerRatingCount ? trainerRatingSum / trainerRatingCount : 0,
      courseSatisfaction: courseRatingCount ? courseRatingSum / courseRatingCount : 0,
      recommendationRate: recommendationCount ? recommendationYes * 100 / recommendationCount : 0
    },
    months,
    trainerFlightHours: Array.from(trainers.values()).sort(
      (first, second) => second.minutes - first.minutes || first.name.localeCompare(second.name)
    ),
    trainerEvaluationScores: Array.from(trainerScores.values()).map((item) => ({
      name: item.name,
      average: item.count ? item.sum / item.count : 0,
      ratings: item.count,
      responses: item.responses.size
    })).sort((first, second) => second.average - first.average || first.name.localeCompare(second.name)),
    evaluationSectionScores: Array.from(sectionScores, ([name, item]) => ({
      name,
      average: item.count ? item.sum / item.count : 0,
      ratings: item.count,
      responses: item.responses.size
    })).sort((first, second) => second.average - first.average || first.name.localeCompare(second.name))
  };
}
