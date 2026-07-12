"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import { postToGoogle } from "@/lib/google-api";
import {
  ClipboardCheck,
  ClipboardList,
  Clock,
  Database,
  FileText,
  GraduationCap,
  Settings,
  Timer,
  UserCog,
  Users
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState
} from "react";

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

function formatDate(value: string) {
  if (!value) return "-";

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-SG",
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  ).format(date);
}

function formatMinutes(minutes: number) {
  const safeMinutes =
    Math.max(
      0,
      Math.round(minutes)
    );

  const hours =
    Math.floor(
      safeMinutes / 60
    );

  const remaining =
    safeMinutes % 60;

  if (!hours) {
    return `${remaining}m`;
  }

  return `${hours}h ${remaining}m`;
}

export default function AdminPage() {
  const { notify } =
    useAppMessage();

  const [
    dashboard,
    setDashboard
  ] = useState<DashboardData>(
    emptyDashboard
  );

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);

      try {
        const result =
          await postToGoogle<{
            dashboard: DashboardData;
          }>({
            action:
              "getDashboardStats"
          });

        setDashboard(
          result.dashboard ||
            emptyDashboard
        );
      } catch (error) {
        setDashboard(
          emptyDashboard
        );

        notify({
          type: "error",
          title:
            "Unable to load dashboard",
          message:
            error instanceof Error
              ? error.message
              : "Dashboard statistics could not be loaded."
        });
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [notify]);

  const highestMonthlyCount =
    useMemo(() => {
      return Math.max(
        1,
        ...dashboard.monthlyActivity.map(
          (month) => month.count
        )
      );
    }, [
      dashboard.monthlyActivity
    ]);

  const dashboardStats = [
    {
      label: "Students",
      value: String(
        dashboard.totalStudents
      ),
      icon: GraduationCap,
      description:
        "Unique student records"
    },
    {
      label: "Pending",
      value: String(
        dashboard.pendingRecords
      ),
      icon: Clock,
      description:
        "Missing signature or entries"
    },
    {
      label: "Trainers",
      value: String(
        dashboard.activeTrainers
      ),
      icon: Users,
      description:
        "Active trainer accounts"
    },
    {
      label: "Completed",
      value: String(
        dashboard.completedRecords
      ),
      icon: ClipboardCheck,
      description:
        "Ready flight log reports"
    },
    {
      label: "Flights",
      value: String(
        dashboard.totalFlights
      ),
      icon: ClipboardList,
      description:
        "Total flight entries"
    },
    {
      label: "Flight Time",
      value: formatMinutes(
        dashboard.totalMinutes
      ),
      icon: Timer,
      description:
        "Combined recorded duration"
    }
  ];

  const quickActions = [
    {
      title: "Flight Logs",
      description:
        "Create or continue student flight logs.",
      href: "/flight-logs",
      icon: ClipboardList
    },
    {
      title: "Records",
      description:
        "View paginated student records.",
      href: "/records",
      icon: FileText
    },
    {
      title: "Master Data",
      description:
        "Manage active reference values.",
      href: "/master-data",
      icon: Settings
    },
    {
      title: "Users",
      description:
        "Manage secure user accounts.",
      href: "/users",
      icon: UserCog
    }
  ];

  return (
    <AppShell>
      {loading ? (
        <LoadingOverlay label="Loading dashboard statistics..." />
      ) : null}

      <div className="app-page">
        <section className="app-card">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                <Database className="h-3.5 w-3.5" />
                Admin Overview
              </div>

              <h1 className="mt-3 text-2xl font-semibold text-slate-950">
                Dashboard
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Lightweight operational statistics calculated securely in Google Sheets.
              </p>
            </div>

            <Link
              href="/flight-logs"
              className="app-button-primary justify-center"
            >
              <ClipboardList className="h-4 w-4" />
              New Flight Log
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {dashboardStats.map(
            (stat) => {
              const Icon = stat.icon;

              return (
                <article
                  key={stat.label}
                  className="app-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-500">
                        {stat.label}
                      </p>

                      <p className="mt-3 break-words text-3xl font-semibold text-slate-950">
                        {stat.value}
                      </p>

                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        {
                          stat.description
                        }
                      </p>
                    </div>

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-brand-gold">
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </article>
              );
            }
          )}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <article className="app-card">
            <h2 className="text-lg font-semibold text-slate-950">
              Monthly Activity
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Records updated during the last six months.
            </p>

            <div className="mt-6 space-y-4">
              {dashboard.monthlyActivity.map(
                (month) => {
                  const percentage =
                    Math.max(
                      month.count
                        ? 8
                        : 0,
                      Math.round(
                        (
                          month.count /
                          highestMonthlyCount
                        ) *
                          100
                      )
                    );

                  return (
                    <div
                      key={month.key}
                      className="grid grid-cols-[80px_minmax(0,1fr)_36px] items-center gap-3"
                    >
                      <p className="text-xs font-semibold text-slate-600">
                        {month.label}
                      </p>

                      <div className="h-8 overflow-hidden rounded-md bg-slate-100">
                        <div
                          className="flex h-full items-center rounded-md bg-slate-950 px-2 text-xs font-semibold text-white transition-all"
                          style={{
                            width:
                              `${percentage}%`
                          }}
                        >
                          {month.count
                            ? month.count
                            : ""}
                        </div>
                      </div>

                      <p className="text-right text-sm font-semibold text-slate-700">
                        {month.count}
                      </p>
                    </div>
                  );
                }
              )}

              {!dashboard
                .monthlyActivity
                .length ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                  No monthly activity available.
                </div>
              ) : null}
            </div>
          </article>

          <article className="app-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  Recent Records
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Five most recently updated records.
                </p>
              </div>

              <Link
                href="/records"
                className="text-sm font-semibold text-sky-700 hover:underline"
              >
                View all
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {dashboard.recentRecords.length ? (
                dashboard.recentRecords.map(
                  (record) => (
                    <div
                      key={record.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">
                            {record.studentName ||
                              "-"}
                          </p>

                          <p className="mt-1 truncate text-sm text-slate-500">
                            {record.company ||
                              "No company"}
                          </p>
                        </div>

                        <span className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                          {
                            record.flightCount
                          }{" "}
                          {record.flightCount ===
                          1
                            ? "flight"
                            : "flights"}
                        </span>
                      </div>

                      <p className="mt-3 text-xs text-slate-400">
                        {formatDate(
                          record.updatedAt ||
                            record.createdAt
                        )}
                      </p>
                    </div>
                  )
                )
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  <p className="text-sm text-slate-500">
                    No recent records available.
                  </p>
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="app-card">
          <h2 className="text-lg font-semibold text-slate-950">
            Quick Actions
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Common administration workflows.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {quickActions.map(
              (action) => {
                const Icon =
                  action.icon;

                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-4 transition hover:border-brand-navy hover:bg-white"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-navy text-white">
                        <Icon className="h-[18px] w-[18px]" />
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-950">
                          {action.title}
                        </p>

                        <p className="mt-1 text-sm leading-6 text-slate-500">
                          {
                            action.description
                          }
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              }
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
