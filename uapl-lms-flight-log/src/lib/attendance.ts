export type AttendancePeriod = "am" | "pm";
export type AttendanceSchedule = "am" | "pm" | "full_day";
export type AttendanceSessionStatus = "draft" | "open" | "closed";

export type AttendanceSession = {
  id: string;
  token: string;
  programmeId: string;
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
  | "programmeId"
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
  amClosesAt: string;
  pmOpensAt: string;
  pmClosesAt: string;
  closesAt: string;
};

export type AttendanceWindowState = {
  amOpen: boolean;
  pmOpen: boolean;
  amExpired: boolean;
  pmExpired: boolean;
  expired: boolean;
  nextOpensAt: string;
};

export function attendanceWindowTimes(courseDate: string) {
  return {
    amOpensAt: `${courseDate}T08:00:00+08:00`,
    amClosesAt: `${courseDate}T13:00:00+08:00`,
    pmOpensAt: `${courseDate}T12:00:00+08:00`,
    pmClosesAt: `${courseDate}T18:00:00+08:00`,
    closesAt: `${courseDate}T18:00:00+08:00`
  };
}

export function attendanceWindowState(
  session: Pick<PublicAttendanceSession, "status" | "schedule" | "amOpen" | "pmOpen" | "amOpensAt" | "amClosesAt" | "pmOpensAt" | "pmClosesAt" | "closesAt">,
  now = Date.now()
): AttendanceWindowState {
  const amTime = Date.parse(session.amOpensAt);
  const amCloseTime = Date.parse(session.amClosesAt);
  const pmTime = Date.parse(session.pmOpensAt);
  const pmCloseTime = Date.parse(session.pmClosesAt || session.closesAt);
  const active = session.status === "open";
  const amEnabled = session.schedule !== "pm" && session.amOpen;
  const pmEnabled = session.schedule !== "am" && session.pmOpen;
  const amExpired = Number.isFinite(amCloseTime) && now > amCloseTime;
  const pmExpired = Number.isFinite(pmCloseTime) && now > pmCloseTime;
  const amOpen = active && amEnabled && !amExpired && (!Number.isFinite(amTime) || now >= amTime);
  const pmOpen = active && pmEnabled && !pmExpired && (!Number.isFinite(pmTime) || now >= pmTime);
  const candidates = [
    amEnabled && !amOpen && Number.isFinite(amTime) && now < amTime ? session.amOpensAt : "",
    pmEnabled && !pmOpen && Number.isFinite(pmTime) && now < pmTime ? session.pmOpensAt : ""
  ].filter(Boolean).sort();
  return {
    amOpen,
    pmOpen,
    amExpired,
    pmExpired,
    expired: (!amEnabled || amExpired) && (!pmEnabled || pmExpired),
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
