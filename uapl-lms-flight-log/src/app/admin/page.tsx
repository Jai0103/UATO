"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import { fetchFirebaseApprovalDashboardSummary } from "@/lib/approvals-api";
import type { ApprovalDashboardSummary } from "@/lib/approvals";
import {
  fetchDashboardAnalytics,
  type DashboardAnalytics,
  type DashboardDateRange,
  type DashboardMonthPoint
} from "@/lib/dashboard-analytics";
import {
  Activity, CalendarDays, ChevronRight, ClipboardCheck, Gauge, Plane,
  ShieldCheck, Star, Timer, UsersRound, Wrench
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";

const emptyAnalytics: DashboardAnalytics = {
  totals: {
    flights: 0, flightMinutes: 0, trainers: 0, maintenanceChecks: 0,
    maintenanceCompliance: 0, attendanceSessions: 0, attendanceCheckIns: 0,
    attendanceRate: 0, evaluationResponses: 0, evaluationAverage: 0
  },
  months: [],
  trainerFlightHours: []
};

const emptyApproval: ApprovalDashboardSummary = {
  totalApprovals: 0, activeApprovals: 0, renewalUpcoming: 0, dueSoon: 0,
  urgent: 0, expiringToday: 0, expired: 0, missingDocuments: 0, nextExpiry: null
};

type Preset = "30d" | "90d" | "6m" | "12m" | "custom";

function localDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function presetRange(preset: Exclude<Preset, "custom">): DashboardDateRange {
  const end = new Date();
  const start = new Date(end);
  if (preset === "30d") start.setDate(start.getDate() - 29);
  if (preset === "90d") start.setDate(start.getDate() - 89);
  if (preset === "6m") start.setMonth(start.getMonth() - 5, 1);
  if (preset === "12m") start.setMonth(start.getMonth() - 11, 1);
  return { dateFrom: localDate(start), dateTo: localDate(end) };
}

function formatMinutes(minutes: number) {
  const value = Math.max(0, Math.round(minutes));
  return `${Math.floor(value / 60)}h ${value % 60}m`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function monthHref(route: string, key: string) {
  const [year, month] = key.split("-");
  return `${route}?year=${year}&month=${month}`;
}

export default function AdminPage() {
  const message = useAppMessage();
  const [preset, setPreset] = useState<Preset>("12m");
  const [draftRange, setDraftRange] = useState(() => presetRange("12m"));
  const [range, setRange] = useState(() => presetRange("12m"));
  const [analytics, setAnalytics] = useState<DashboardAnalytics>(emptyAnalytics);
  const [approval, setApproval] = useState<ApprovalDashboardSummary>(emptyApproval);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [analyticsResult, approvalResult] = await Promise.allSettled([
      fetchDashboardAnalytics(range), fetchFirebaseApprovalDashboardSummary()
    ]);
    if (analyticsResult.status === "fulfilled") setAnalytics(analyticsResult.value);
    else {
      setAnalytics(emptyAnalytics);
      message.error("Dashboard analytics could not load", analyticsResult.reason instanceof Error ? analyticsResult.reason.message : "Please refresh and try again.");
    }
    if (approvalResult.status === "fulfilled") setApproval(approvalResult.value);
    setUpdatedAt(new Date().toISOString());
    setLoading(false);
  }, [message, range]);

  useEffect(() => { void load(); }, [load]);

  function choosePreset(next: Exclude<Preset, "custom">) {
    const nextRange = presetRange(next);
    setPreset(next); setDraftRange(nextRange); setRange(nextRange);
  }

  function applyCustomRange() {
    if (!draftRange.dateFrom || !draftRange.dateTo || draftRange.dateFrom > draftRange.dateTo) {
      message.warning("Select a valid date range", "The start date must be on or before the end date.");
      return;
    }
    setPreset("custom"); setRange(draftRange);
  }

  const stats = [
    { label: "Flight time", value: formatMinutes(analytics.totals.flightMinutes), detail: `${analytics.totals.flights} flights across ${analytics.totals.trainers} trainers`, icon: Timer, tone: "bg-sky-50 text-sky-700", href: `/records?dateFrom=${range.dateFrom}&dateTo=${range.dateTo}` },
    { label: "Maintenance compliance", value: formatPercent(analytics.totals.maintenanceCompliance), detail: `${analytics.totals.maintenanceChecks} checklist decisions`, icon: Wrench, tone: "bg-emerald-50 text-emerald-700", href: `/ua-maintenance/records?dateFrom=${range.dateFrom}&dateTo=${range.dateTo}` },
    { label: "Attendance rate", value: formatPercent(analytics.totals.attendanceRate), detail: `${analytics.totals.attendanceCheckIns} check-ins in ${analytics.totals.attendanceSessions} sessions`, icon: ClipboardCheck, tone: "bg-violet-50 text-violet-700", href: `/attendance/records?dateFrom=${range.dateFrom}&dateTo=${range.dateTo}` },
    { label: "Evaluation average", value: analytics.totals.evaluationAverage ? `${analytics.totals.evaluationAverage.toFixed(2)} / 5` : "No responses", detail: `${analytics.totals.evaluationResponses} learner responses`, icon: Star, tone: "bg-amber-50 text-amber-700", href: `/evaluations?dateFrom=${range.dateFrom}&dateTo=${range.dateTo}` }
  ];

  return <AppShell>
    {loading ? <LoadingOverlay label="Building operational dashboard" description="Reading current Firebase activity and compliance data..." /> : null}
    <div className="app-page space-y-4">
      <section className="app-page-header dashboard-header">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div><p className="text-xs font-bold uppercase text-[#075f8f]">Operational intelligence</p><h1 className="mt-1 text-2xl font-bold text-[#16263c] sm:text-3xl">Dashboard</h1><p className="mt-2 text-sm text-[#6b7d92]">Flight operations, training quality, attendance, and fleet readiness.</p></div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="inline-flex w-fit rounded-lg border border-[#d7e0ea] bg-[#f6f8fb] p-1">
              {(["30d", "90d", "6m", "12m"] as const).map((item) => <button key={item} type="button" onClick={() => choosePreset(item)} className={`h-9 rounded-md px-3 text-xs font-bold transition ${preset === item ? "bg-white text-[#0866ff] shadow-sm" : "text-[#64748b] hover:bg-white/70 hover:text-[#16263c]"}`}>{item === "30d" ? "30 days" : item === "90d" ? "90 days" : item === "6m" ? "6 months" : "12 months"}</button>)}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[11px] font-bold uppercase text-[#64748b]">From<input type="date" value={draftRange.dateFrom} onChange={(event) => { setPreset("custom"); setDraftRange((current) => ({ ...current, dateFrom: event.target.value })); }} className="mt-1 block h-10 rounded-lg border border-[#d7e0ea] bg-white px-3 text-sm font-medium text-[#16263c]" /></label>
              <label className="text-[11px] font-bold uppercase text-[#64748b]">To<input type="date" value={draftRange.dateTo} max={localDate(new Date())} onChange={(event) => { setPreset("custom"); setDraftRange((current) => ({ ...current, dateTo: event.target.value })); }} className="mt-1 block h-10 rounded-lg border border-[#d7e0ea] bg-white px-3 text-sm font-medium text-[#16263c]" /></label>
              <button type="button" onClick={applyCustomRange} className="h-10 rounded-lg bg-[#0866ff] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#0758dd]">Apply</button>
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs font-medium text-[#8a99aa]">Showing {range.dateFrom} to {range.dateTo}{updatedAt ? ` · Updated ${new Date(updatedAt).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
      </section>

      <ApprovalStrip approval={approval} />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => { const Icon = stat.icon; return <Link key={stat.label} href={stat.href} className="dashboard-stat-card group rounded-lg border border-[#d7e0ea] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#b9c9dc] hover:shadow-lg"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[#6b7d92]">{stat.label}</p><p className="mt-2 text-2xl font-bold text-[#16263c]">{stat.value}</p></div><div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.tone}`}><Icon className="h-5 w-5" /></div></div><div className="mt-3 flex items-center justify-between gap-2 text-xs text-[#718096]"><span>{stat.detail}</span><ChevronRight className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5" /></div></Link>; })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <ChartPanel eyebrow="Flight operations" title="Flight hours by month" icon={Plane} href={`/records?dateFrom=${range.dateFrom}&dateTo=${range.dateTo}`}><MonthBarChart data={analytics.months} value={(item) => item.flightMinutes / 60} format={(value) => `${value.toFixed(1)}h`} color="#0866ff" route="/records" /></ChartPanel>
        <ChartPanel eyebrow="Trainer activity" title="Flight hours by trainer" icon={UsersRound} href={`/records?dateFrom=${range.dateFrom}&dateTo=${range.dateTo}`}><TrainerBars analytics={analytics} range={range} /></ChartPanel>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ChartPanel eyebrow="Fleet readiness" title="Maintenance compliance" icon={ShieldCheck} href={`/ua-maintenance/records?dateFrom=${range.dateFrom}&dateTo=${range.dateTo}`}><MonthBarChart data={analytics.months} value={(item) => item.maintenanceCompliance} format={formatPercent} color="#059669" route="/ua-maintenance/records" emptyWhen={(item) => item.maintenancePass + item.maintenanceFail === 0} /></ChartPanel>
        <ChartPanel eyebrow="Training attendance" title="Attendance capture rate" icon={Gauge} href={`/attendance/records?dateFrom=${range.dateFrom}&dateTo=${range.dateTo}`} note="Sessions with at least one check-in."><MonthBarChart data={analytics.months} value={(item) => item.attendanceRate} format={formatPercent} color="#7c3aed" route="/attendance/records" emptyWhen={(item) => item.attendanceSessions === 0} /></ChartPanel>
        <ChartPanel eyebrow="Learner feedback" title="Evaluation average" icon={Activity} href={`/evaluations?dateFrom=${range.dateFrom}&dateTo=${range.dateTo}`}><MonthBarChart data={analytics.months} value={(item) => item.evaluationAverage} format={(value) => `${value.toFixed(2)} / 5`} color="#d97706" route="/evaluations" maximum={5} emptyWhen={(item) => item.evaluationResponses === 0} /></ChartPanel>
      </section>
    </div>
  </AppShell>;
}

function ChartPanel({ eyebrow, title, icon: Icon, href, note, children }: { eyebrow: string; title: string; icon: typeof Plane; href: string; note?: string; children: ReactNode }) {
  return <article className="app-card dashboard-panel min-w-0 overflow-hidden"><header className="flex items-start justify-between gap-3 border-b border-[#e5ebf2] pb-4"><div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#eef6ff] text-[#0866ff]"><Icon className="h-5 w-5" /></div><div><p className="text-[11px] font-bold uppercase text-[#075f8f]">{eyebrow}</p><h2 className="mt-1 text-lg font-bold text-[#16263c]">{title}</h2>{note ? <p className="mt-1 text-xs text-[#718096]">{note}</p> : null}</div></div><Link href={href} aria-label={`Open ${title} records`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#075f8f] transition hover:bg-[#edf5f8]"><ChevronRight className="h-4 w-4" /></Link></header>{children}</article>;
}

function MonthBarChart({ data, value, format, color, route, maximum, emptyWhen }: { data: DashboardMonthPoint[]; value: (item: DashboardMonthPoint) => number; format: (value: number) => string; color: string; route: string; maximum?: number; emptyWhen?: (item: DashboardMonthPoint) => boolean }) {
  const [active, setActive] = useState("");
  const max = maximum || Math.max(1, ...data.map(value));
  if (!data.length) return <EmptyChart />;
  return <div className="mt-5"><div className="flex h-52 items-end gap-1.5 sm:gap-2">{data.map((item) => { const amount = value(item); const empty = emptyWhen?.(item) ?? false; const height = empty ? 3 : Math.max(5, (amount / max) * 100); return <Link key={item.key} href={monthHref(route, item.key)} onMouseEnter={() => setActive(item.key)} onMouseLeave={() => setActive("")} onFocus={() => setActive(item.key)} onBlur={() => setActive("")} className="group relative flex h-full min-w-0 flex-1 items-end rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0866ff]/40" aria-label={`${item.label}: ${empty ? "No data" : format(amount)}. Open records.`}>{active === item.key ? <div className="absolute left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#16263c] px-2.5 py-1.5 text-xs font-bold text-white shadow-lg" style={{ bottom: `calc(${height}% + 8px)` }}>{item.label}: {empty ? "No data" : format(amount)}</div> : null}<span className="w-full rounded-t-md opacity-85 transition group-hover:opacity-100 group-hover:shadow-md" style={{ height: `${height}%`, backgroundColor: empty ? "#dbe3ec" : color }} /></Link>; })}</div><div className="mt-3 flex gap-1.5 sm:gap-2">{data.map((item, index) => <span key={item.key} className="min-w-0 flex-1 truncate text-center text-[10px] font-semibold text-[#718096]">{data.length <= 6 || index % 2 === 0 ? item.label : ""}</span>)}</div></div>;
}

function TrainerBars({ analytics, range }: { analytics: DashboardAnalytics; range: DashboardDateRange }) {
  const trainers = analytics.trainerFlightHours.slice(0, 7);
  const max = Math.max(1, ...trainers.map((item) => item.minutes));
  if (!trainers.length) return <EmptyChart />;
  return <div className="mt-5 space-y-4">{trainers.map((trainer) => <Link key={trainer.name} href={`/records?trainer=${encodeURIComponent(trainer.name)}&dateFrom=${range.dateFrom}&dateTo=${range.dateTo}`} className="group block rounded-lg p-1 transition hover:bg-[#f4f8fb]"><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="truncate font-semibold text-[#24364d]">{trainer.name}</span><span className="shrink-0 font-bold text-[#075f8f]">{formatMinutes(trainer.minutes)}</span></div><div className="h-2 overflow-hidden rounded-full bg-[#e8eef5]"><div className="h-full rounded-full bg-[#0866ff] transition-all group-hover:bg-[#0758dd]" style={{ width: `${Math.max(4, (trainer.minutes / max) * 100)}%` }} /></div><p className="mt-1 text-[11px] text-[#8190a2]">{trainer.flights} flights</p></Link>)}</div>;
}

function EmptyChart() {
  return <div className="mt-5 flex h-52 items-center justify-center rounded-lg border border-dashed border-[#d7e0ea] bg-[#f8fafc]"><div className="text-center"><CalendarDays className="mx-auto h-6 w-6 text-[#9aa8b7]" /><p className="mt-2 text-sm font-semibold text-[#60748a]">No activity in this period</p></div></div>;
}

function ApprovalStrip({ approval }: { approval: ApprovalDashboardSummary }) {
  const urgent = approval.expired + approval.expiringToday + approval.urgent;
  const warning = urgent > 0 || approval.renewalUpcoming > 0;
  return <Link href="/approvals" className={`group flex flex-col gap-4 rounded-lg border p-5 transition hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center sm:justify-between ${warning ? "border-amber-200 bg-amber-50/70" : "border-emerald-200 bg-emerald-50/70"}`}><div className="flex items-start gap-3"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${warning ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}><ShieldCheck className="h-5 w-5" /></div><div><p className={`text-xs font-bold uppercase ${warning ? "text-amber-700" : "text-emerald-700"}`}>Regulatory monitoring</p><p className="mt-1 font-bold text-[#16263c]">{urgent ? `${urgent} approval item${urgent === 1 ? "" : "s"} need attention` : approval.renewalUpcoming ? `${approval.renewalUpcoming} renewal approaching` : "Approvals are within their active validity period"}</p><p className="mt-1 text-sm text-[#6b7d92]">{approval.totalApprovals} tracked · {approval.missingDocuments} missing documents</p></div></div><span className="inline-flex items-center gap-1 text-sm font-bold text-[#075f8f]">View register <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span></Link>;
}
