"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import { fetchApprovalDashboardSummary } from "@/lib/approvals-api";
import {
  APPROVAL_TYPE_LABELS,
  CAAS_ESOMS_URL,
  type ApprovalDashboardSummary
} from "@/lib/approvals";
import { postToGoogle } from "@/lib/google-api";
import {
  AlertTriangle,
  BellRing,
  BookOpenCheck,
  Boxes,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Database,
  ExternalLink,
  FileBarChart,
  FileText,
  GraduationCap,
  Settings,
  ShieldCheck,
  Timer,
  UserCog,
  Users,
  Wrench
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

const monthlyActivityColors = [
  {
    bar: "bg-sky-500",
    track: "bg-sky-50",
    badge: "bg-sky-50 text-sky-700 ring-sky-200"
  },
  {
    bar: "bg-emerald-500",
    track: "bg-emerald-50",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200"
  },
  {
    bar: "bg-amber-500",
    track: "bg-amber-50",
    badge: "bg-amber-50 text-amber-700 ring-amber-200"
  },
  {
    bar: "bg-rose-500",
    track: "bg-rose-50",
    badge: "bg-rose-50 text-rose-700 ring-rose-200"
  },
  {
    bar: "bg-indigo-500",
    track: "bg-indigo-50",
    badge: "bg-indigo-50 text-indigo-700 ring-indigo-200"
  },
  {
    bar: "bg-teal-500",
    track: "bg-teal-50",
    badge: "bg-teal-50 text-teal-700 ring-teal-200"
  }
];

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

export default function AdminPage() {
  const { notify } = useAppMessage();
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [approvalDashboard, setApprovalDashboard] =
    useState<ApprovalDashboardSummary>(emptyApprovalDashboard);
  const [approvalMonitoringAvailable, setApprovalMonitoringAvailable] =
    useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      try {
        const [dashboardResult, approvalResult] = await Promise.allSettled([
          postToGoogle<{ dashboard: DashboardData }>({
            action: "getDashboardStats"
          }),
          fetchApprovalDashboardSummary()
        ] as const);

        if (dashboardResult.status === "rejected") {
          throw dashboardResult.reason;
        }

        setDashboard(dashboardResult.value.dashboard || emptyDashboard);

        if (approvalResult.status === "fulfilled") {
          setApprovalDashboard(approvalResult.value || emptyApprovalDashboard);
          setApprovalMonitoringAvailable(true);
        } else {
          setApprovalDashboard(emptyApprovalDashboard);
          setApprovalMonitoringAvailable(false);
          notify({
            type: "warning",
            title: "Approval monitoring unavailable",
            message:
              approvalResult.reason instanceof Error
                ? approvalResult.reason.message
                : "Approval expiry information could not be loaded."
          });
        }
      } catch (error) {
        setDashboard(emptyDashboard);
        notify({
          type: "error",
          title: "Unable to load dashboard",
          message:
            error instanceof Error
              ? error.message
              : "Dashboard statistics could not be loaded."
        });
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, [notify]);

  const highestMonthlyCount = useMemo(
    () => Math.max(1, ...dashboard.monthlyActivity.map((month) => month.count)),
    [dashboard.monthlyActivity]
  );

  const sixMonthTotal = useMemo(
    () => dashboard.monthlyActivity.reduce((total, month) => total + month.count, 0),
    [dashboard.monthlyActivity]
  );

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

  const quickActions = [
    {
      title: "Flight Logs",
      description: "Create or continue student flight logs.",
      href: "/flight-logs",
      icon: ClipboardList,
      tone: "bg-sky-50 text-sky-700 ring-sky-100"
    },
    {
      title: "Staff Training",
      description: "Manage internal staff training records.",
      href: "/staff-training",
      icon: BookOpenCheck,
      tone: "bg-violet-50 text-violet-700 ring-violet-100"
    },
    {
      title: "UA Maintenance",
      description: "Complete aircraft maintenance checks.",
      href: "/ua-maintenance",
      icon: Wrench,
      tone: "bg-amber-50 text-amber-700 ring-amber-100"
    },
    {
      title: "Inventory",
      description: "Control equipment, batteries, and movements.",
      href: "/inventory",
      icon: Boxes,
      tone: "bg-emerald-50 text-emerald-700 ring-emerald-100"
    },
    {
      title: "AGA Approvals",
      description: "Monitor approvals, permits, locations, and renewals.",
      href: "/approvals",
      icon: ShieldCheck,
      tone: "bg-cyan-50 text-cyan-700 ring-cyan-100"
    },
    {
      title: "Records",
      description: "View paginated student records.",
      href: "/records",
      icon: FileText,
      tone: "bg-indigo-50 text-indigo-700 ring-indigo-100"
    },
    {
      title: "Reports",
      description: "Prepare and download combined reports.",
      href: "/reports",
      icon: FileBarChart,
      tone: "bg-rose-50 text-rose-700 ring-rose-100"
    },
    {
      title: "Master Data",
      description: "Manage active reference values.",
      href: "/master-data",
      icon: Settings,
      tone: "bg-cyan-50 text-cyan-700 ring-cyan-100"
    },
    {
      title: "Users",
      description: "Manage secure user accounts.",
      href: "/users",
      icon: UserCog,
      tone: "bg-slate-100 text-slate-700 ring-slate-200"
    }
  ];

  return (
    <AppShell>
      {loading ? <LoadingOverlay label="Loading dashboard statistics..." /> : null}

      <div className="app-page">
        <section className="app-page-header">
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

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
          {dashboardStats.map((stat) => {
            const Icon = stat.icon;
            const [accent, iconBackground, iconColor] = stat.tone.split(" ");

            return (
              <article
                key={stat.label}
                className={`group min-w-0 rounded-lg border border-[#d7e0ea] border-t-[3px] bg-white p-4 shadow-[0_1px_2px_rgba(16,42,67,0.04),0_7px_20px_rgba(16,42,67,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(16,42,67,0.06),0_14px_30px_rgba(16,42,67,0.09)] sm:p-5 ${accent}`}
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
          <article className="app-card min-w-0 overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-[#e5ebf2] pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="app-section-label">Activity trend</p>
                <h2 className="app-section-title">Monthly Activity</h2>
                <p className="mt-1 text-sm text-[#6b7d92]">
                  Records updated during the last six months.
                </p>
              </div>
              <div className="w-fit rounded-lg border border-[#d4e7ef] bg-[#f0f7fa] px-4 py-2.5">
                <p className="text-xl font-bold text-[#075f8f]">{sixMonthTotal}</p>
                <p className="text-[11px] font-bold uppercase text-[#53748a]">
                  Six-month total
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {dashboard.monthlyActivity.map((month, index) => {
                const color = monthlyActivityColors[index % monthlyActivityColors.length];
                const percentage =
                  month.count > 0
                    ? Math.max(10, Math.round((month.count / highestMonthlyCount) * 100))
                    : 0;

                return (
                  <div
                    key={month.key}
                    className="grid grid-cols-[64px_minmax(0,1fr)_40px] items-center gap-2 sm:grid-cols-[88px_minmax(0,1fr)_52px] sm:gap-3"
                  >
                    <p className="truncate text-xs font-semibold text-[#506278] sm:text-sm">
                      {month.label}
                    </p>
                    <div className={`relative h-9 overflow-hidden rounded-lg ${color.track}`}>
                      {month.count > 0 ? (
                        <div
                          className={`flex h-full items-center rounded-lg px-3 text-xs font-bold text-white transition-all duration-500 ${color.bar}`}
                          style={{ width: `${percentage}%` }}
                          title={`${month.count} updated records`}
                        >
                          <span className="truncate">{month.count}</span>
                        </div>
                      ) : (
                        <div className="flex h-full items-center px-3 text-xs font-medium text-slate-400">
                          No activity
                        </div>
                      )}
                    </div>
                    <span className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-bold ring-1 ${color.badge}`}>
                      {month.count}
                    </span>
                  </div>
                );
              })}

              {!dashboard.monthlyActivity.length ? (
                <div className="app-empty-state">
                  <p className="text-sm font-semibold text-[#405168]">
                    No monthly activity available
                  </p>
                  <p className="mt-1 text-sm text-[#718096]">
                    Updated flight records will appear here.
                  </p>
                </div>
              ) : null}
            </div>
          </article>

          <article className="app-card min-w-0">
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

        <section>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="app-section-label">Shortcuts</p>
              <h2 className="app-section-title">Quick Actions</h2>
              <p className="mt-1 text-sm text-[#6b7d92]">
                Open common operational and administration workflows.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group flex min-w-0 items-start gap-3 rounded-lg border border-[#d7e0ea] bg-white p-4 shadow-[0_1px_2px_rgba(16,42,67,0.04),0_6px_18px_rgba(16,42,67,0.04)] transition hover:-translate-y-0.5 hover:border-[#a8c8d8] hover:shadow-[0_2px_4px_rgba(16,42,67,0.05),0_12px_28px_rgba(16,42,67,0.09)]"
                >
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1 ${action.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-[#16263c]">{action.title}</p>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[#b7c3d0] transition group-hover:translate-x-0.5 group-hover:text-[#075f8f]" />
                    </div>
                    <p className="mt-1 text-sm leading-5 text-[#6b7d92]">
                      {action.description}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
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
    <section className={`overflow-hidden rounded-lg border shadow-[0_1px_2px_rgba(16,42,67,0.04)] ${panelTone}`}>
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
