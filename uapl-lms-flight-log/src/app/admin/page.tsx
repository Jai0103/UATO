"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import {
  APPROVAL_TYPE_LABELS,
  CAAS_ESOMS_URL,
  type ApprovalDashboardSummary
} from "@/lib/approvals";
import { postToGoogle } from "@/lib/google-api";
import { fetchFirebaseFlightDashboard } from "@/lib/flight-log-firebase";
import { fetchAttendanceDashboardAnalytics } from "@/lib/attendance-api";
import type {
  AttendanceDashboardAnalytics,
  AttendanceSession
} from "@/lib/attendance";
import {
  AlertTriangle,
  BellRing,
  CalendarCheck,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Database,
  ExternalLink,
  GraduationCap,
  ShieldCheck,
  Timer,
  UserCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type RecentRecord = {
  id: string;
  studentName: string;
  company: string;
  flightCount: number;
  createdAt: string;
  updatedAt: string;
};

type MonthlyActivity = {
  key: string;
  label: string;
  count: number;
};

type AttendanceMonthlyActivity = {
  key: string;
  label: string;
  sessions: number;
  checkIns: number;
};

type DashboardData = {
  totalStudents: number;
  totalRecords: number;
  pendingRecords: number;
  completedRecords: number;
  activeTrainers: number;
  totalFlights: number;
  totalMinutes: number;
  recentRecords: RecentRecord[];
  monthlyActivity: MonthlyActivity[];
};

type DashboardBundleSection<T> = {
  available: boolean;
  data: T | null;
  error: string;
};

type AdminDashboardBundle = {
  dashboard: DashboardData;
  approvals: DashboardBundleSection<ApprovalDashboardSummary>;
  generatedAt: string;
};

const emptyDashboard: DashboardData = {
  totalStudents: 0,
  totalRecords: 0,
  pendingRecords: 0,
  completedRecords: 0,
  activeTrainers: 0,
  totalFlights: 0,
  totalMinutes: 0,
  recentRecords: [],
  monthlyActivity: []
};

const emptyApprovalDashboard: ApprovalDashboardSummary = {
  totalApprovals: 0,
  activeApprovals: 0,
  renewalUpcoming: 0,
  dueSoon: 0,
  urgent: 0,
  expiringToday: 0,
  expired: 0,
  missingDocuments: 0,
  nextExpiry: null
};

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatApprovalDate(value: string) {
  if (!value) return "-";
  const parts = value.slice(0, 10).split("-");
  if (parts.length !== 3) return value;

  const date = new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2])
  );

  return new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function formatMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remaining = safeMinutes % 60;
  return hours ? `${hours}h ${remaining}m` : `${remaining}m`;
}

function attendanceMonthlyActivity(
  records: AttendanceSession[],
  monthlyCheckIns: AttendanceDashboardAnalytics["monthlyCheckIns"]
) {
  const formatter = new Intl.DateTimeFormat("en-SG", { month: "short" });
  const current = new Date();
  const months: AttendanceMonthlyActivity[] = [];

  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(current.getFullYear(), current.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const monthlyRecords = records.filter((record) => record.courseDate.startsWith(key));
    months.push({
      key,
      label: formatter.format(date),
      sessions: monthlyRecords.length,
      checkIns: monthlyCheckIns.find((month) => month.key === key)?.count || 0
    });
  }

  return months;
}

export default function AdminPage() {
  const { notify } = useAppMessage();
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [approvalDashboard, setApprovalDashboard] =
    useState<ApprovalDashboardSummary>(emptyApprovalDashboard);
  const [approvalMonitoringAvailable, setApprovalMonitoringAvailable] =
    useState(true);
  const [attendanceAnalytics, setAttendanceAnalytics] =
    useState<AttendanceDashboardAnalytics>({
      sessions: [],
      totalCheckIns: 0,
      monthlyCheckIns: []
    });
  const [attendanceAvailable, setAttendanceAvailable] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      const [flightResult, attendanceResult] = await Promise.allSettled([
        fetchFirebaseFlightDashboard(),
        fetchAttendanceDashboardAnalytics()
      ]);

      if (flightResult.status === "fulfilled") {
        setDashboard(flightResult.value);
      } else {
        setDashboard(emptyDashboard);
        notify({
          type: "error",
          title: "Unable to load Flight Log dashboard",
          message:
            flightResult.reason instanceof Error
              ? flightResult.reason.message
              : "Firebase statistics could not be loaded."
        });
      }

      if (attendanceResult.status === "fulfilled") {
        setAttendanceAnalytics(attendanceResult.value);
        setAttendanceAvailable(true);
      } else {
        setAttendanceAnalytics({
          sessions: [],
          totalCheckIns: 0,
          monthlyCheckIns: []
        });
        setAttendanceAvailable(false);
      }
      setLoading(false);

      try {
        const response = await postToGoogle<{
          bundle: AdminDashboardBundle;
        }>({
          action: "getAdminDashboardBundle"
        });
        const bundle = response.bundle;

        if (bundle?.approvals?.available) {
          setApprovalDashboard(
            bundle.approvals.data || emptyApprovalDashboard
          );
          setApprovalMonitoringAvailable(true);
        } else {
          setApprovalDashboard(emptyApprovalDashboard);
          setApprovalMonitoringAvailable(false);
          notify({
            type: "warning",
            title: "Approval monitoring unavailable",
            message:
              bundle?.approvals?.error ||
              "Approval expiry information could not be loaded."
          });
        }

      } catch (error) {
        setApprovalDashboard(emptyApprovalDashboard);
        setApprovalMonitoringAvailable(false);
        notify({
          type: "warning",
          title: "Approval monitoring unavailable",
          message:
            error instanceof Error
              ? error.message
              : "Approval expiry information could not be loaded."
        });
      }
    }

    void loadDashboard();
  }, [notify]);

  const annualActivityTotal = useMemo(
    () => dashboard.monthlyActivity.reduce((total, month) => total + month.count, 0),
    [dashboard.monthlyActivity]
  );

  const attendanceInsights = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7);
    const attendanceRecords = attendanceAnalytics.sessions;
    return {
      totalSessions: attendanceRecords.length,
      checkIns: attendanceAnalytics.totalCheckIns,
      open: attendanceRecords.filter((record) => record.status === "open").length,
      closed: attendanceRecords.filter((record) => record.status === "closed").length,
      draft: attendanceRecords.filter((record) => record.status === "draft").length,
      thisMonth: attendanceRecords.filter((record) =>
        record.courseDate.startsWith(month)
      ).length,
      monthly: attendanceMonthlyActivity(
        attendanceRecords,
        attendanceAnalytics.monthlyCheckIns
      ),
      recent: [...attendanceRecords]
        .sort((first, second) => second.courseDate.localeCompare(first.courseDate))
        .slice(0, 4)
    };
  }, [attendanceAnalytics]);

  const dashboardStats = [
    {
      label: "Students",
      value: String(dashboard.totalStudents),
      icon: GraduationCap,
      description: "Unique student records",
      tone: "border-t-sky-500 bg-sky-50 text-sky-700"
    },
    {
      label: "Pending",
      value: String(dashboard.pendingRecords),
      icon: Clock,
      description: "Missing signature or entries",
      tone: "border-t-amber-500 bg-amber-50 text-amber-700"
    },
    {
      label: "Trainers",
      value: String(dashboard.activeTrainers),
      icon: Users,
      description: "Active trainer accounts",
      tone: "border-t-indigo-500 bg-indigo-50 text-indigo-700"
    },
    {
      label: "Completed",
      value: String(dashboard.completedRecords),
      icon: ClipboardCheck,
      description: "Ready flight log reports",
      tone: "border-t-emerald-500 bg-emerald-50 text-emerald-700"
    },
    {
      label: "Flights",
      value: String(dashboard.totalFlights),
      icon: ClipboardList,
      description: "Total flight entries",
      tone: "border-t-rose-500 bg-rose-50 text-rose-700"
    },
    {
      label: "Flight Time",
      value: formatMinutes(dashboard.totalMinutes),
      icon: Timer,
      description: "Combined recorded duration",
      tone: "border-t-teal-500 bg-teal-50 text-teal-700"
    }
  ];

  return (
    <AppShell>
      {loading ? <LoadingOverlay label="Loading dashboard statistics..." /> : null}

      <div className="app-page">
        <section className="app-page-header dashboard-header">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-md bg-[#edf5f8] px-2.5 py-1 text-xs font-bold text-[#075f8f] ring-1 ring-[#d5e9f1]">
                <Database className="h-3.5 w-3.5" />
                Admin Overview
              </div>
              <h1 className="mt-3 text-2xl font-bold text-[#16263c] sm:text-3xl">
                Dashboard
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6b7d92]">
                Monitor training records, operational activity, and system administration.
              </p>
            </div>

            <Link href="/flight-logs" className="app-button-primary w-full sm:w-auto">
              <ClipboardList className="h-4 w-4" />
              New Flight Log
            </Link>
          </div>
        </section>

        <ApprovalMonitoringPanel
          dashboard={approvalDashboard}
          available={approvalMonitoringAvailable}
        />

        <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
          {dashboardStats.map((stat) => {
            const Icon = stat.icon;
            const [accent, iconBackground, iconColor] = stat.tone.split(" ");

            return (
              <article
                key={stat.label}
                className={`dashboard-stat-card group min-w-0 rounded-lg border border-[#d7e0ea] border-t-[3px] bg-white p-4 transition hover:-translate-y-0.5 sm:p-5 ${accent}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-[#6b7d92] sm:text-sm sm:normal-case">
                      {stat.label}
                    </p>
                    <p className="mt-2 break-words text-2xl font-bold text-[#16263c] sm:text-3xl">
                      {stat.value}
                    </p>
                  </div>
                  <div className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 transition group-hover:scale-105 sm:flex ${iconBackground} ${iconColor}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-2 text-xs leading-5 text-[#718096]">
                  {stat.description}
                </p>
              </article>
            );
          })}
        </section>

        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <article className="app-card dashboard-panel min-w-0 overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-[#e5ebf2] pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="app-section-label">Activity trend</p>
                <h2 className="app-section-title">Monthly Activity</h2>
                <p className="mt-1 text-sm text-[#6b7d92]">
                  Records updated during the latest 12 months.
                </p>
              </div>
              <div className="w-fit rounded-lg border border-[#d4e7ef] bg-[#f0f7fa] px-4 py-2.5">
                <p className="text-xl font-bold text-[#075f8f]">{annualActivityTotal}</p>
                <p className="text-[11px] font-bold uppercase text-[#53748a]">
                  12-month total
                </p>
              </div>
            </div>

            <MonthlyActivityChart data={dashboard.monthlyActivity} />
          </article>

          <article className="app-card dashboard-panel min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="app-section-label">Latest updates</p>
                <h2 className="app-section-title">Recent Records</h2>
                <p className="mt-1 text-sm text-[#6b7d92]">
                  Five most recently updated records.
                </p>
              </div>
              <Link
                href="/records"
                className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[#075f8f] transition hover:bg-[#edf5f8]"
              >
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-5 divide-y divide-[#e7edf3] overflow-hidden rounded-lg border border-[#dbe3ec]">
              {dashboard.recentRecords.length ? (
                dashboard.recentRecords.map((record) => (
                  <div key={record.id} className="bg-white p-4 transition hover:bg-[#f6f9fb]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#16263c]">
                          {record.studentName || "-"}
                        </p>
                        <p className="mt-1 truncate text-sm text-[#6b7d92]">
                          {record.company || "No company"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
                        {record.flightCount} {record.flightCount === 1 ? "flight" : "flights"}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-[#8a99aa]">
                      {formatDate(record.updatedAt || record.createdAt)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="bg-[#f7f9fb] p-8 text-center">
                  <p className="text-sm text-[#718096]">No recent records available.</p>
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
          <article className="app-card dashboard-panel min-w-0 overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-[#e5ebf2] pb-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="app-section-label">Training attendance</p>
                <h2 className="app-section-title">Attendance Activity</h2>
                <p className="mt-1 text-sm text-[#6b7d92]">
                  Monthly course sessions and learner sign-ins during the latest 12 months.
                </p>
              </div>
              <Link
                href="/attendance/records"
                className="inline-flex h-10 w-fit shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[#075f8f] transition hover:bg-[#edf5f8]"
              >
                Attendance records <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <AttendanceMetric
                label="Sessions"
                value={attendanceInsights.totalSessions}
                icon={<CalendarCheck className="h-4 w-4" />}
                tone="bg-sky-50 text-sky-700 ring-sky-100"
              />
              <AttendanceMetric
                label="AM / PM sign-ins"
                value={attendanceInsights.checkIns}
                icon={<UserCheck className="h-4 w-4" />}
                tone="bg-indigo-50 text-indigo-700 ring-indigo-100"
              />
              <AttendanceMetric
                label="Open sessions"
                value={attendanceInsights.open}
                icon={<Users className="h-4 w-4" />}
                tone="bg-emerald-50 text-emerald-700 ring-emerald-100"
              />
              <AttendanceMetric
                label="This month"
                value={attendanceInsights.thisMonth}
                icon={<ClipboardCheck className="h-4 w-4" />}
                tone="bg-amber-50 text-amber-700 ring-amber-100"
              />
            </div>

            {attendanceAvailable ? (
              <AttendanceTrendChart data={attendanceInsights.monthly} />
            ) : (
              <div className="app-empty-state mt-5">
                <p className="text-sm font-semibold text-[#405168]">
                  Attendance analytics are temporarily unavailable
                </p>
                <p className="mt-1 text-sm text-[#718096]">
                  Flight Log statistics remain available. Refresh to retry attendance data.
                </p>
              </div>
            )}
          </article>

          <article className="app-card dashboard-panel min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="app-section-label">Session control</p>
                <h2 className="app-section-title">Attendance Status</h2>
                <p className="mt-1 text-sm text-[#6b7d92]">
                  Current readiness of all attendance sessions.
                </p>
              </div>
              <Link
                href="/attendance"
                aria-label="Manage attendance sessions"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#d7e0ea] text-[#075f8f] transition hover:bg-[#edf5f8]"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <AttendanceStatusChart
              draft={attendanceInsights.draft}
              open={attendanceInsights.open}
              closed={attendanceInsights.closed}
            />

            <div className="mt-6 border-t border-[#e5ebf2] pt-5">
              <p className="text-xs font-bold uppercase text-[#718096]">
                Recent sessions
              </p>
              <div className="mt-3 space-y-2">
                {attendanceInsights.recent.length ? (
                  attendanceInsights.recent.map((record) => (
                    <div
                      key={record.id}
                      className="rounded-lg border border-[#e1e8ef] bg-[#fbfdfe] px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[#16263c]">
                            {record.courseName}
                          </p>
                          <p className="mt-1 truncate text-xs text-[#718096]">
                            {record.courseDate} · {record.instructorName}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-md bg-sky-50 px-2 py-1 text-xs font-bold text-sky-700 ring-1 ring-sky-100">
                          {record.status}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg bg-[#f7f9fb] px-3 py-6 text-center text-sm text-[#718096]">
                    No attendance sessions yet.
                  </p>
                )}
              </div>
            </div>
          </article>
        </section>

      </div>
    </AppShell>
  );
}

function MonthlyActivityChart({ data }: { data: MonthlyActivity[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (!data.length) {
    return (
      <div className="app-empty-state mt-5">
        <p className="text-sm font-semibold text-[#405168]">
          No monthly activity available
        </p>
        <p className="mt-1 text-sm text-[#718096]">
          Updated flight records will appear here.
        </p>
      </div>
    );
  }

  const width = 720;
  const height = 286;
  const padding = { top: 24, right: 22, bottom: 48, left: 44 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maximum = Math.max(1, ...data.map((month) => month.count));
  const points = data.map((month, index) => ({
    ...month,
    x:
      padding.left +
      (data.length === 1 ? chartWidth / 2 : (index / (data.length - 1)) * chartWidth),
    y: padding.top + chartHeight - (month.count / maximum) * chartHeight
  }));
  const linePath = points
    .map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${
    padding.top + chartHeight
  } L ${points[0].x} ${padding.top + chartHeight} Z`;
  const activePoint = activeIndex === null ? null : points[activeIndex];
  const pointColors = ["#0284c7", "#059669", "#d97706", "#e11d48", "#4f46e5", "#0d9488"];

  return (
    <div className="relative mt-5 min-w-0 rounded-lg border border-[#e1e8ef] bg-[#fbfdfe] p-2 sm:p-4">
      {activePoint ? (
        <div
          className={`pointer-events-none absolute z-20 min-w-[132px] -translate-y-full rounded-lg bg-[#16263c] px-3 py-2 text-center shadow-xl transition-all duration-150 ${
            activeIndex === 0
              ? "translate-x-0"
              : activeIndex === points.length - 1
                ? "-translate-x-full"
                : "-translate-x-1/2"
          }`}
          style={{
            left: `${(activePoint.x / width) * 100}%`,
            top: `${(activePoint.y / height) * 100}%`
          }}
        >
          <p className="text-[11px] font-semibold text-slate-300">{activePoint.label}</p>
          <p className="mt-0.5 text-sm font-bold text-white">
            {activePoint.count} {activePoint.count === 1 ? "updated record" : "updated records"}
          </p>
          <span
            className={`absolute top-full h-2 w-2 -translate-y-1/2 rotate-45 bg-[#16263c] ${
              activeIndex === 0
                ? "left-4"
                : activeIndex === points.length - 1
                  ? "right-4"
                  : "left-1/2 -translate-x-1/2"
            }`}
          />
        </div>
      ) : null}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full overflow-visible"
        role="img"
        aria-label="Monthly record activity chart"
        onMouseLeave={() => setActiveIndex(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + chartHeight * ratio;
          const value = Math.round(maximum * (1 - ratio));
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#dfe7ee"
                strokeDasharray={ratio === 1 ? undefined : "4 6"}
              />
              <text
                x={padding.left - 12}
                y={y + 4}
                textAnchor="end"
                fill="#7b8ca0"
                fontSize="11"
                fontWeight="600"
              >
                {value}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="#dff1f6" opacity="0.72" />
        <path
          d={linePath}
          fill="none"
          stroke="#075f8f"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((point, index) => {
          const active = activeIndex === index;
          return (
            <g
              key={point.key}
              role="button"
              tabIndex={0}
              aria-label={`${point.label}: ${point.count} updated records`}
              className="cursor-pointer outline-none"
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
              onClick={() => setActiveIndex(active ? null : index)}
            >
              {active ? (
                <line
                  x1={point.x}
                  x2={point.x}
                  y1={padding.top}
                  y2={padding.top + chartHeight}
                  stroke="#9fb5c5"
                  strokeDasharray="3 5"
                />
              ) : null}
              <circle cx={point.x} cy={point.y} r="18" fill="transparent" />
              <circle
                cx={point.x}
                cy={point.y}
                r={active ? 7 : 5.5}
                fill={pointColors[index % pointColors.length]}
                stroke="white"
                strokeWidth="3"
                className="transition-all duration-150"
              />
              <text
                x={point.x}
                y={height - 18}
                textAnchor="middle"
                fill={active ? "#075f8f" : "#60748a"}
                fontSize="12"
                fontWeight={active ? "700" : "600"}
              >
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="px-2 pb-1 text-center text-xs text-[#7b8ca0] sm:text-left">
        Point to a month to view its updated record count.
      </p>
    </div>
  );
}

function AttendanceMetric({
  label,
  value,
  icon,
  tone
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-[#e1e8ef] bg-white p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#6b7d92]">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${tone}`}>
          {icon}
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold text-[#16263c]">{value}</p>
    </div>
  );
}

function AttendanceTrendChart({ data }: { data: AttendanceMonthlyActivity[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 760;
  const height = 280;
  const padding = { top: 30, right: 22, bottom: 48, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maximum = Math.max(
    1,
    ...data.flatMap((month) => [month.sessions, month.checkIns])
  );
  const groupWidth = chartWidth / Math.max(1, data.length);
  const barWidth = Math.min(16, groupWidth * 0.28);
  const active = activeIndex === null ? null : data[activeIndex];

  return (
    <div className="relative mt-5 min-w-0 rounded-lg border border-[#e1e8ef] bg-[#fbfdfe] p-2 sm:p-4">
      <div className="flex flex-wrap items-center justify-end gap-4 px-2 pt-1 text-xs font-semibold text-[#60748a]">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-sky-600" /> Sessions
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> AM / PM sign-ins
        </span>
      </div>

      {active && activeIndex !== null ? (
        <div
          className={`pointer-events-none absolute top-14 z-20 min-w-[150px] rounded-lg bg-[#16263c] px-3 py-2 text-center shadow-xl ${
            activeIndex < 2
              ? "translate-x-0"
              : activeIndex > data.length - 3
                ? "-translate-x-full"
                : "-translate-x-1/2"
          }`}
          style={{
            left: `${((padding.left + groupWidth * (activeIndex + 0.5)) / width) * 100}%`
          }}
        >
          <p className="text-[11px] font-semibold text-slate-300">{active.key}</p>
          <p className="mt-1 text-sm font-bold text-white">
            {active.sessions} sessions · {active.checkIns} sign-ins
          </p>
        </div>
      ) : null}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full"
        role="img"
        aria-label="Monthly attendance sessions and sign-ins"
        onMouseLeave={() => setActiveIndex(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + chartHeight * ratio;
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#dfe7ee"
                strokeDasharray={ratio === 1 ? undefined : "4 6"}
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                fill="#7b8ca0"
                fontSize="11"
                fontWeight="600"
              >
                {Math.round(maximum * (1 - ratio))}
              </text>
            </g>
          );
        })}

        {data.map((month, index) => {
          const center = padding.left + groupWidth * (index + 0.5);
          const sessionHeight = (month.sessions / maximum) * chartHeight;
          const checkInHeight = (month.checkIns / maximum) * chartHeight;
          const isActive = activeIndex === index;
          return (
            <g
              key={month.key}
              role="button"
              tabIndex={0}
              aria-label={`${month.key}: ${month.sessions} sessions and ${month.checkIns} sign-ins`}
              className="cursor-pointer outline-none"
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
              onClick={() => setActiveIndex(isActive ? null : index)}
            >
              {isActive ? (
                <rect
                  x={center - groupWidth / 2 + 2}
                  y={padding.top}
                  width={groupWidth - 4}
                  height={chartHeight}
                  rx="4"
                  fill="#edf5f8"
                />
              ) : null}
              <rect
                x={center - barWidth - 1.5}
                y={padding.top + chartHeight - sessionHeight}
                width={barWidth}
                height={Math.max(month.sessions ? 2 : 0, sessionHeight)}
                rx="3"
                fill="#0284c7"
              />
              <rect
                x={center + 1.5}
                y={padding.top + chartHeight - checkInHeight}
                width={barWidth}
                height={Math.max(month.checkIns ? 2 : 0, checkInHeight)}
                rx="3"
                fill="#10b981"
              />
              <rect
                x={center - groupWidth / 2}
                y={padding.top}
                width={groupWidth}
                height={chartHeight}
                fill="transparent"
              />
              <text
                x={center}
                y={height - 18}
                textAnchor="middle"
                fill={isActive ? "#075f8f" : "#60748a"}
                fontSize="11"
                fontWeight={isActive ? "700" : "600"}
              >
                {month.label}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="px-2 pb-1 text-center text-xs text-[#7b8ca0] sm:text-left">
        Point to a month to compare sessions with AM and PM attendance submissions.
      </p>
    </div>
  );
}

function AttendanceStatusChart({
  draft,
  open,
  closed
}: {
  draft: number;
  open: number;
  closed: number;
}) {
  const total = draft + open + closed;
  const values = [
    { label: "Open", value: open, color: "bg-emerald-500", text: "text-emerald-700" },
    { label: "Draft", value: draft, color: "bg-amber-500", text: "text-amber-700" },
    { label: "Closed", value: closed, color: "bg-sky-600", text: "text-sky-700" }
  ];

  return (
    <div className="mt-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-4xl font-bold text-[#16263c]">{total}</p>
          <p className="mt-1 text-xs font-semibold uppercase text-[#718096]">
            Total sessions
          </p>
        </div>
        <div className="rounded-lg bg-[#f0f7fa] px-3 py-2 text-right ring-1 ring-[#d4e7ef]">
          <p className="text-lg font-bold text-[#075f8f]">{open}</p>
          <p className="text-[10px] font-bold uppercase text-[#53748a]">Open now</p>
        </div>
      </div>

      <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-slate-100" aria-label="Attendance session status distribution">
        {values.map((item) => (
          <span
            key={item.label}
            className={`${item.color} transition-all`}
            style={{ width: `${total ? (item.value / total) * 100 : 0}%` }}
          />
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {values.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
              <span className="text-sm font-semibold text-[#52667d]">{item.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-bold ${item.text}`}>{item.value}</span>
              <span className="w-10 text-right text-xs text-[#8a99aa]">
                {total ? Math.round((item.value / total) * 100) : 0}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApprovalMonitoringPanel({
  dashboard,
  available
}: {
  dashboard: ApprovalDashboardSummary;
  available: boolean;
}) {
  const criticalCount =
    dashboard.expired + dashboard.expiringToday + dashboard.urgent;
  const upcomingCount = dashboard.dueSoon + dashboard.renewalUpcoming;
  const hasCritical = criticalCount > 0;
  const hasUpcoming = upcomingCount > 0;

  const panelTone = !available
    ? "border-amber-200 bg-amber-50/70"
    : hasCritical
    ? "border-rose-200 bg-rose-50/70"
    : hasUpcoming
      ? "border-amber-200 bg-amber-50/70"
      : "border-emerald-200 bg-emerald-50/60";

  const iconTone = !available
    ? "bg-amber-100 text-amber-700"
    : hasCritical
    ? "bg-rose-100 text-rose-700"
    : hasUpcoming
      ? "bg-amber-100 text-amber-700"
      : "bg-emerald-100 text-emerald-700";

  return (
    <section className={`dashboard-approval-panel overflow-hidden rounded-lg border ${panelTone}`}>
      <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${iconTone}`}>
            {!available ? (
              <AlertTriangle className="h-5 w-5" />
            ) : hasCritical ? (
              <AlertTriangle className="h-5 w-5" />
            ) : hasUpcoming ? (
              <BellRing className="h-5 w-5" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
          </div>

          <div className="min-w-0">
            <p className="app-section-label">Regulatory monitoring</p>
            <h2 className="mt-1 text-lg font-bold text-[#16263c]">
              {!available
                ? "Approval monitoring is temporarily unavailable"
                : dashboard.totalApprovals === 0
                ? "AGA Approvals register is ready"
                : hasCritical
                  ? `${criticalCount} approval ${criticalCount === 1 ? "requires" : "require"} immediate attention`
                  : hasUpcoming
                    ? `${upcomingCount} renewal ${upcomingCount === 1 ? "is" : "are"} approaching`
                    : "Approvals are within their active validity period"}
            </h2>

            {!available ? (
              <p className="mt-1 text-sm leading-6 text-[#5f7187]">
                Flight operations remain available. Open AGA Approvals to retry the regulatory register.
              </p>
            ) : dashboard.nextExpiry ? (
              <p className="mt-1 text-sm leading-6 text-[#5f7187]">
                Next expiry: {APPROVAL_TYPE_LABELS[dashboard.nextExpiry.approvalType]} {dashboard.nextExpiry.approvalNumber} on {formatApprovalDate(dashboard.nextExpiry.displayExpiryDate)}.
              </p>
            ) : (
              <p className="mt-1 text-sm leading-6 text-[#5f7187]">
                Add UATO, UABTO, Class 1 Activity, and Operator approvals to begin expiry monitoring.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <Link
            href="/approvals"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#c7d4e0] bg-white px-4 text-sm font-semibold text-[#29445f] transition hover:bg-[#f5f8fb]"
          >
            <ShieldCheck className="h-4 w-4" /> Manage Approvals
          </Link>
          <a
            href={CAAS_ESOMS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#102a43] px-4 text-sm font-semibold text-white transition hover:bg-[#173b5d]"
          >
            Renew in CAAS <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      {available && dashboard.totalApprovals > 0 ? (
        <div className="grid grid-cols-2 border-t border-black/5 bg-white/65 sm:grid-cols-4">
          <ApprovalMetric label="Tracked" value={dashboard.totalApprovals} />
          <ApprovalMetric label="Renewal Window" value={upcomingCount} />
          <ApprovalMetric label="Urgent / Expired" value={criticalCount} critical={criticalCount > 0} />
          <ApprovalMetric label="Missing PDF" value={dashboard.missingDocuments} critical={dashboard.missingDocuments > 0} />
        </div>
      ) : null}
    </section>
  );
}

function ApprovalMetric({
  label,
  value,
  critical = false
}: {
  label: string;
  value: number;
  critical?: boolean;
}) {
  return (
    <div className="border-b border-r border-[#e5ebf2] p-3 last:border-r-0 sm:border-b-0 sm:p-4">
      <p className={`text-xl font-bold ${critical ? "text-rose-700" : "text-[#16263c]"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] font-bold uppercase text-[#718096]">
        {label}
      </p>
    </div>
  );
}
