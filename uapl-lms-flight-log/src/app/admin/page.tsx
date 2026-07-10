"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import {
  getFlightLogRecords,
  type FlightLogRecord
} from "@/lib/flight-log-storage";
import { fetchGoogleRecords } from "@/lib/google-api";
import {
  ClipboardCheck,
  ClipboardList,
  Clock,
  Database,
  FileText,
  GraduationCap,
  Settings,
  UserCog,
  Users
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function AdminPage() {
  const { notify } = useAppMessage();

  const [records, setRecords] = useState<FlightLogRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardData() {
      setLoading(true);

      try {
        const googleRecords = await fetchGoogleRecords();
        setRecords(googleRecords);
      } catch {
        setRecords(getFlightLogRecords());
        notify({
          type: "warning",
          title: "Using local dashboard data",
          message: "Google Sheets records could not be loaded."
        });
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [notify]);

  const dashboardStats = useMemo(() => {
    const uniqueStudents = new Set(
      records
        .map((record) =>
          `${record.student.studentName}-${record.student.lastFourCharacters}`
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
    );

    const pendingUploads = records.filter(
      (record) =>
        !record.student.studentSignatureDataUrl || record.rows.length === 0
    ).length;

    const completedLogs = records.filter(
      (record) =>
        record.student.studentSignatureDataUrl && record.rows.length > 0
    ).length;

    return [
      {
        label: "Students",
        value: String(uniqueStudents.size),
        icon: GraduationCap,
        description: "Unique student records"
      },
      {
        label: "Pending",
        value: String(pendingUploads),
        icon: Clock,
        description: "Missing signature or entries"
      },
      {
        label: "Trainers",
        value: "1",
        icon: Users,
        description: "Active trainer accounts"
      },
      {
        label: "Completed",
        value: String(completedLogs),
        icon: ClipboardCheck,
        description: "Ready flight log reports"
      }
    ];
  }, [records]);

  const recentRecords = records.slice(0, 5);

  const quickActions = [
    {
      title: "Flight Logs",
      description: "Create or continue student flight logs.",
      href: "/flight-logs",
      icon: ClipboardList
    },
    {
      title: "Records",
      description: "View saved student records.",
      href: "/records",
      icon: FileText
    },
    {
      title: "Master Data",
      description: "Manage dropdowns and reference values.",
      href: "/master-data",
      icon: Settings
    },
    {
      title: "Users",
      description: "Create admin and trainer accounts.",
      href: "/users",
      icon: UserCog
    }
  ];

  return (
    <AppShell>
      {loading ? <LoadingOverlay label="Loading dashboard data..." /> : null}

      <div className="app-page">
        <section className="app-card">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                <Database size={14} />
                Admin Overview
              </div>

              <h1 className="mt-3 text-2xl font-semibold text-slate-950">
                Dashboard
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Monitor students, submissions, reports, and system setup.
              </p>
            </div>

            <Link href="/flight-logs" className="app-button-primary">
              <ClipboardList size={17} />
              New Flight Log
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {dashboardStats.map((stat) => {
            const Icon = stat.icon;

            return (
              <article key={stat.label} className="app-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      {stat.label}
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-slate-950">
                      {stat.value}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      {stat.description}
                    </p>
                  </div>

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-brand-gold">
                    <Icon size={20} />
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <article className="app-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  Quick Actions
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Common admin and trainer workflows.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {quickActions.map((action) => {
                const Icon = action.icon;

                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-brand-navy hover:bg-white"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-navy text-white">
                        <Icon size={18} />
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-slate-950">
                          {action.title}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-500">
                          {action.description}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </article>

          <article className="app-card">
            <h2 className="text-lg font-semibold text-slate-950">
              Recent Records
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Latest saved flight log records.
            </p>

            <div className="mt-5 space-y-3">
              {recentRecords.length ? (
                recentRecords.map((record) => (
                  <div
                    key={record.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {record.student.studentName || "-"}
                    </p>
                    <p className="mt-1 truncate text-sm text-slate-500">
                      {record.student.company || "No company"} - {record.rows.length} flights
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      {record.updatedAt
                        ? new Date(record.updatedAt).toLocaleString()
                        : "-"}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  <p className="text-sm text-slate-500">
                    No recent records available.
                  </p>
                </div>
              )}
            </div>
          </article>
        </section>
      </div>
    </AppShell>
  );
}
