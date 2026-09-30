export type AttendancePeriod = "am" | "pm";
export type AttendanceSchedule = "am" | "pm" | "full_day";
export type AttendanceSessionStatus = "draft" | "open" | "closed";

export type AttendanceSession = {
  id: string;
  token: string;
  courseName: string;
  courseCode: string;
  courseDate: string;
  instructorName: string;
  instructorEmail: string;
  schedule: AttendanceSchedule;
  status: AttendanceSessionStatus;
  amOpen: boolean;
  pmOpen: boolean;
  trainerComments: string;
  createdByUid: string;
  createdByEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type AttendanceSessionInput = Pick<
  AttendanceSession,
  | "id"
  | "courseName"
  | "courseCode"
  | "courseDate"
  | "instructorName"
  | "instructorEmail"
  | "schedule"
  | "status"
  | "amOpen"
  | "pmOpen"
  | "trainerComments"
>;

export type PublicAttendanceSession = Pick<
  AttendanceSession,
  | "id"
  | "token"
  | "courseName"
  | "courseCode"
  | "courseDate"
  | "instructorName"
  | "schedule"
  | "status"
  | "amOpen"
  | "pmOpen"
> & {
  amOpensAt: string;
  pmOpensAt: string;
  closesAt: string;
};

export type AttendanceWindowState = {
  amOpen: boolean;
  pmOpen: boolean;
  expired: boolean;
  nextOpensAt: string;
};

export function attendanceWindowTimes(courseDate: string) {
  return {
    amOpensAt: `${courseDate}T08:00:00+08:00`,
    pmOpensAt: `${courseDate}T12:00:00+08:00`,
    closesAt: `${courseDate}T23:59:59+08:00`
  };
}

export function attendanceWindowState(
  session: Pick<PublicAttendanceSession, "status" | "schedule" | "amOpen" | "pmOpen" | "amOpensAt" | "pmOpensAt" | "closesAt">,
  now = Date.now()
): AttendanceWindowState {
  const amTime = Date.parse(session.amOpensAt);
  const pmTime = Date.parse(session.pmOpensAt);
  const closeTime = Date.parse(session.closesAt);
  const active = session.status === "open" && (!Number.isFinite(closeTime) || now <= closeTime);
  const amEnabled = session.schedule !== "pm" && session.amOpen;
  const pmEnabled = session.schedule !== "am" && session.pmOpen;
  const amOpen = active && amEnabled && (!Number.isFinite(amTime) || now >= amTime);
  const pmOpen = active && pmEnabled && (!Number.isFinite(pmTime) || now >= pmTime);
  const candidates = [
    amEnabled && !amOpen && Number.isFinite(amTime) && now < amTime ? session.amOpensAt : "",
    pmEnabled && !pmOpen && Number.isFinite(pmTime) && now < pmTime ? session.pmOpensAt : ""
  ].filter(Boolean).sort();
  return {
    amOpen,
    pmOpen,
    expired: Number.isFinite(closeTime) && now > closeTime,
    nextOpensAt: candidates[0] || ""
  };
}

export type AttendanceSubmission = {
  id: string;
  sessionId: string;
  publicToken: string;
  period: AttendancePeriod;
  learnerName: string;
  learnerNameLower: string;
  lastFour: string;
  identityHash: string;
  signatureDataUrl: string;
  submittedAt: string;
  updatedAt: string;
};

export type AttendanceDashboard = {
  totalSessions: number;
  openSessions: number;
  totalAttendances: number;
  thisMonthSessions: number;
};

export type AttendanceDashboardAnalytics = {
  sessions: AttendanceSession[];
  totalCheckIns: number;
  monthlyCheckIns: Array<{ key: string; count: number }>;
};

export type AttendanceRecordSummary = AttendanceSession & {
  amCount: number;
  pmCount: number;
  uniqueLearnerCount: number;
};
