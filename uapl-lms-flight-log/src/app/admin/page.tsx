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
  Clock,
  GraduationCap,
  Settings,
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
        icon: GraduationCap
      },
      {
        label: "Pending Uploads",
        value: String(pendingUploads),
        icon: Clock
      },
      {
        label: "Trainers",
        value: "1",
        icon: Users
      },
      {
        label: "Completed Logs",
        value: String(completedLogs),
        icon: ClipboardCheck
      }
    ];
  }, [records]);

  return (
    <AppShell>
      {loading ? <LoadingOverlay label="Loading dashboard data..." /> : null}

      <div className="w-full max-w-none space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor students, trainers, and flight log submissions.
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {dashboardStats.map((stat) => {
            const Icon = stat.icon;

            return (
              <article
                key={stat.label}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                  <Icon size={20} className="text-brand-gold" />
                </div>
                <p className="mt-4 text-3xl font-semibold text-slate-950">
                  {stat.value}
                </p>
              </article>
            );
          })}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-navy text-white">
                <Settings size={18} />
              </div>

              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  Master Data
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Manage locations, batteries, instructors, UA models, and categories.
                </p>

                <Link
                  href="/master-data"
                  className="mt-4 inline-flex h-10 items-center rounded-md bg-brand-navy px-4 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Open Master Data
                </Link>
              </div>
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">
              User Management
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              User creation and email invitations will be connected in a later step.
            </p>
          </article>
        </section>
      </div>
    </AppShell>
  );
}
