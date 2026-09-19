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
>;

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

export type AttendanceRecordSummary = AttendanceSession & {
  amCount: number;
  pmCount: number;
  uniqueLearnerCount: number;
};
