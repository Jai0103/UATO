import { collection, doc, getDoc, getDocs, Timestamp } from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase-client";
import { evaluationRatingFields } from "@/lib/evaluations";

export type DashboardDateRange = {
  dateFrom: string;
  dateTo: string;
};

export type DashboardMonthPoint = {
  key: string;
  label: string;
  flightMinutes: number;
  flightCount: number;
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

export type DashboardAnalytics = {
  totals: {
    flights: number;
    flightMinutes: number;
    trainers: number;
    maintenanceChecks: number;
    maintenanceCompliance: number;
    attendanceSessions: number;
    attendanceCheckIns: number;
    attendanceRate: number;
    evaluationResponses: number;
    evaluationAverage: number;
  };
  months: DashboardMonthPoint[];
  trainerFlightHours: TrainerFlightHours[];
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
    evaluationResponseSnapshot,
    evaluationAnswerSnapshot
  ] = await Promise.all([
    getDocs(collection(firestore, "flightEntries")),
    getDocs(collection(firestore, "uaMaintenanceRecords")),
    getDocs(collection(firestore, "attendanceSessions")),
    getDocs(collection(firestore, "attendanceSubmissions")),
    getDocs(collection(firestore, "evaluationResponses")),
    getDocs(collection(firestore, "evaluationAnswers"))
  ]);

  const months = monthSeries(range);
  const monthMap = new Map(months.map((item) => [item.key, item]));
  const trainers = new Map<string, TrainerFlightHours>();

  flightSnapshot.docs.forEach((item) => {
    const data = item.data();
    const date = isoDate(data.date);
    if (!inRange(date, range)) return;
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

  const attendanceSessions = attendanceSessionSnapshot.docs
    .map((item) => ({ id: item.id, courseDate: text(item.data().courseDate) }))
    .filter((item) => inRange(isoDate(item.courseDate), range));
  const includedAttendanceIds = new Set(attendanceSessions.map((item) => item.id));
  const attendanceCounts = new Map<string, number>();
  attendanceSubmissionSnapshot.docs.forEach((item) => {
    const sessionId = text(item.data().sessionId);
    if (!includedAttendanceIds.has(sessionId)) return;
    attendanceCounts.set(sessionId, (attendanceCounts.get(sessionId) || 0) + 1);
  });
  attendanceSessions.forEach((session) => {
    const month = monthMap.get(monthKey(isoDate(session.courseDate)));
    if (!month) return;
    month.attendanceSessions += 1;
    if ((attendanceCounts.get(session.id) || 0) > 0) month.attendanceCoveredSessions += 1;
  });

  const answersByResponse = new Map<string, number[]>();
  evaluationAnswerSnapshot.docs.forEach((item) => {
    const data = item.data();
    const responseId = text(data.responseId);
    const rating = number(data.rating);
    if (!responseId || rating <= 0) return;
    const values = answersByResponse.get(responseId) || [];
    values.push(rating);
    answersByResponse.set(responseId, values);
  });
  const evaluationTotals = new Map<string, { sum: number; count: number }>();
  evaluationResponseSnapshot.docs.forEach((item) => {
    const data = item.data();
    const date = isoDate(data.submittedAt);
    if (!inRange(date, range)) return;
    const answerRatings = answersByResponse.get(item.id) || [];
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
  });

  months.forEach((month) => {
    const maintenanceTotal = month.maintenancePass + month.maintenanceFail;
    month.maintenanceCompliance = maintenanceTotal
      ? (month.maintenancePass / maintenanceTotal) * 100
      : 0;
    month.attendanceRate = month.attendanceSessions
      ? (month.attendanceCoveredSessions / month.attendanceSessions) * 100
      : 0;
    const evaluation = evaluationTotals.get(month.key);
    month.evaluationAverage = evaluation?.count ? evaluation.sum / evaluation.count : 0;
  });

  const totalMaintenancePass = months.reduce((total, item) => total + item.maintenancePass, 0);
  const totalMaintenanceFail = months.reduce((total, item) => total + item.maintenanceFail, 0);
  const totalAttendanceSessions = months.reduce((total, item) => total + item.attendanceSessions, 0);
  const totalAttendanceCovered = months.reduce(
    (total, item) => total + item.attendanceCoveredSessions,
    0
  );
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
      attendanceRate: totalAttendanceSessions
        ? (totalAttendanceCovered / totalAttendanceSessions) * 100
        : 0,
      evaluationResponses: totalEvaluationResponses,
      evaluationAverage: totalEvaluationResponses
        ? evaluationWeightedSum / totalEvaluationResponses
        : 0
    },
    months,
    trainerFlightHours: Array.from(trainers.values()).sort(
      (first, second) => second.minutes - first.minutes || first.name.localeCompare(second.name)
    )
  };
}
