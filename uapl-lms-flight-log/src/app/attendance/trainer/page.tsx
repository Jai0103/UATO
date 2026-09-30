"use client";

import QRCode from "qrcode";
import {
  CalendarDays, CheckCircle2, Clock3, Copy, Download, ExternalLink,
  Eye, Loader2, QrCode, RefreshCw, UserCheck, UsersRound, X
} from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAppMessage } from "@/components/message-provider";
import { firebaseAuth, firebaseFunctions } from "@/lib/firebase-client";
import { fetchTrainerAttendanceSubmissions } from "@/lib/attendance-api";
import type { AttendancePeriod, AttendanceSubmission } from "@/lib/attendance";

type AssignedAttendanceSession = {
  id: string;
  token: string;
  courseName: string;
  courseCode: string;
  courseDate: string;
  instructorName: string;
  schedule: "am" | "pm" | "full_day";
  amEnabled: boolean;
  pmEnabled: boolean;
  amOpen: boolean;
  pmOpen: boolean;
  amOpensAt: string;
  pmOpensAt: string;
  closesAt: string;
  amCount: number;
  pmCount: number;
};

function checkInUrl(token: string, period: AttendancePeriod) {
  const basePath = window.location.pathname.startsWith("/UATO/") ? "/UATO" : "";
  return `${window.location.origin}${basePath}/attendance/check-in/?token=${encodeURIComponent(token)}&period=${period}`;
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-SG", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "numeric", minute: "2-digit" }).format(date);
}

function formatSubmitted(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit" }).format(date);
}

function periodIsOpen(session: AssignedAttendanceSession, period: AttendancePeriod, now: number) {
  const enabled = period === "am" ? session.amEnabled : session.pmEnabled;
  const opensAt = Date.parse(period === "am" ? session.amOpensAt : session.pmOpensAt);
  const closesAt = Date.parse(session.closesAt);
  return enabled && now >= opensAt && now <= closesAt;
}

export default function TrainerAttendancePage() {
  const message = useAppMessage();
  const [sessions, setSessions] = useState<AssignedAttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<AssignedAttendanceSession | null>(null);
  const [period, setPeriod] = useState<AttendancePeriod>("am");
  const [qrImage, setQrImage] = useState("");
  const [rosterSession, setRosterSession] = useState<AssignedAttendanceSession | null>(null);
  const [rosterPeriod, setRosterPeriod] = useState<AttendancePeriod>("am");
  const [submissions, setSubmissions] = useState<AttendanceSubmission[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      await firebaseAuth.authStateReady();
      if (!firebaseAuth.currentUser) throw new Error("Please sign in again.");
      const callable = httpsCallable<Record<string, never>, { sessions: AssignedAttendanceSession[] }>(firebaseFunctions, "listTrainerAttendanceSessions");
      const result = await callable({});
      setSessions(result.data.sessions);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Please try again.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);

  useEffect(() => {
    if (!selected) return;
    setQrImage("");
    void QRCode.toDataURL(checkInUrl(selected.token, period), { width: 900, margin: 3, errorCorrectionLevel: "H", color: { dark: "#102a43", light: "#ffffff" } })
      .then(setQrImage).catch(() => { setSelected(null); message.error("QR code failed", "Please try again."); });
  }, [selected, period, message]);

  const roster = useMemo(() => submissions.filter((item) => item.period === rosterPeriod), [rosterPeriod, submissions]);
  const rosterCounts = useMemo(() => ({ am: submissions.filter((item) => item.period === "am").length, pm: submissions.filter((item) => item.period === "pm").length }), [submissions]);

  function showQr(session: AssignedAttendanceSession) {
    const firstOpen: AttendancePeriod = periodIsOpen(session, "am", now) ? "am" : "pm";
    setPeriod(firstOpen); setSelected(session);
  }

  async function openRoster(session: AssignedAttendanceSession) {
    setRosterSession(session); setRosterPeriod(session.amEnabled ? "am" : "pm"); setSubmissions([]); setRosterLoading(true);
    try { setSubmissions(await fetchTrainerAttendanceSubmissions(session.id)); }
    catch (error) { message.error("Attendance list unavailable", error instanceof Error ? error.message : "Please try again."); }
    finally { setRosterLoading(false); }
  }

  async function copyLink(session: AssignedAttendanceSession, selectedPeriod: AttendancePeriod) {
    try { await navigator.clipboard.writeText(checkInUrl(session.token, selectedPeriod)); message.success("Attendance link copied", `${selectedPeriod.toUpperCase()} check-in link is ready.`); }
    catch { message.error("Link could not be copied", "Please try again."); }
  }

  return <AppShell><div className="app-page">
    <section className="app-page-header"><div className="flex items-center justify-between gap-4"><div className="min-w-0"><p className="text-xs font-bold uppercase text-cyan-800">Assigned sessions</p><h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">QR Attendance</h1><p className="mt-2 text-sm text-slate-500">Attendance opens automatically at 8:00 AM and 12:00 PM Singapore time.</p></div><button type="button" onClick={() => void load()} disabled={loading} title="Refresh sessions" aria-label="Refresh sessions" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></div></section>

    {loading ? <div className="flex min-h-48 items-center justify-center gap-3 text-sm font-semibold text-slate-600"><Loader2 className="h-5 w-5 animate-spin text-cyan-700" />Loading assigned sessions...</div> : null}
    {!loading && loadError ? <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><p className="font-semibold">Attendance sessions could not be loaded</p><p className="mt-1">{loadError}</p><button type="button" onClick={() => void load()} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 font-semibold ring-1 ring-amber-200"><RefreshCw className="h-4 w-4" />Retry</button></section> : null}
    {!loading && !loadError && !sessions.length ? <section className="rounded-lg border border-slate-200 bg-white p-8 text-center"><QrCode className="mx-auto h-8 w-8 text-slate-300" /><h2 className="mt-3 font-bold text-slate-900">No upcoming attendance sessions</h2><p className="mt-1 text-sm text-slate-600">Assigned sessions will appear here when an administrator sets them to Open.</p></section> : null}

    {!loading && !loadError ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sessions.map((session) => {
      const amOpen = periodIsOpen(session, "am", now); const pmOpen = periodIsOpen(session, "pm", now); const anyOpen = amOpen || pmOpen;
      const nextTime = !amOpen && session.amEnabled && now < Date.parse(session.amOpensAt) ? session.amOpensAt : !pmOpen && session.pmEnabled && now < Date.parse(session.pmOpensAt) ? session.pmOpensAt : "";
      return <article key={session.id} className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-lg">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold ${anyOpen ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{anyOpen ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{anyOpen ? "Signing open" : nextTime ? `Opens ${formatTime(nextTime)}` : "Scheduled"}</span><h2 className="mt-3 text-lg font-bold leading-6 text-slate-950">{session.courseName}</h2>{session.courseCode ? <p className="mt-1 text-sm text-slate-500">{session.courseCode}</p> : null}</div><QrCode className="h-5 w-5 shrink-0 text-cyan-800" /></div>
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-600"><CalendarDays className="h-4 w-4 text-slate-400" />{formatDate(session.courseDate)}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">{session.amEnabled ? <div className={`rounded-lg border p-3 ${amOpen ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-600">AM</span><span className={`h-2 w-2 rounded-full ${amOpen ? "bg-emerald-500" : "bg-slate-300"}`} /></div><p className="mt-1 text-xl font-bold text-slate-900">{session.amCount}</p><p className="text-[11px] text-slate-500">submitted</p></div> : <div />}{session.pmEnabled ? <div className={`rounded-lg border p-3 ${pmOpen ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-600">PM</span><span className={`h-2 w-2 rounded-full ${pmOpen ? "bg-emerald-500" : "bg-slate-300"}`} /></div><p className="mt-1 text-xl font-bold text-slate-900">{session.pmCount}</p><p className="text-[11px] text-slate-500">submitted</p></div> : <div />}</div>
        <div className="mt-4 grid grid-cols-[44px_1fr] gap-2"><button type="button" onClick={() => void openRoster(session)} className="flex h-11 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-800" title="View submitted attendance" aria-label="View submitted attendance"><Eye className="h-4 w-4" /></button><button type="button" onClick={() => showQr(session)} disabled={!anyOpen} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-cyan-800 px-3 text-sm font-bold text-white transition hover:bg-cyan-900 disabled:cursor-not-allowed disabled:bg-slate-300"><QrCode className="h-4 w-4" />{anyOpen ? "Show active QR" : "QR opens automatically"}</button></div>
      </article>;
    })}</div> : null}
  </div>

  {selected ? <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-5"><button type="button" className="absolute inset-0 bg-slate-950/60" onClick={() => setSelected(null)} aria-label="Close QR" /><div className="relative max-h-[95dvh] w-full overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-lg sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-cyan-800">Live attendance QR</p><h2 className="mt-1 text-xl font-bold text-slate-950">{selected.courseName}</h2><p className="mt-1 text-sm text-slate-600">{formatDate(selected.courseDate)}</p></div><button type="button" onClick={() => setSelected(null)} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200"><X className="h-4 w-4" /></button></div>
    <div className="mt-5 grid grid-cols-2 gap-2">{selected.amEnabled ? <button type="button" disabled={!periodIsOpen(selected, "am", now)} onClick={() => setPeriod("am")} className={`h-11 rounded-lg border text-sm font-bold ${period === "am" ? "border-cyan-700 bg-cyan-50 text-cyan-800" : "border-slate-300 text-slate-600"} disabled:opacity-40`}>AM · {periodIsOpen(selected, "am", now) ? "Open" : "8:00 AM"}</button> : null}{selected.pmEnabled ? <button type="button" disabled={!periodIsOpen(selected, "pm", now)} onClick={() => setPeriod("pm")} className={`h-11 rounded-lg border text-sm font-bold ${period === "pm" ? "border-cyan-700 bg-cyan-50 text-cyan-800" : "border-slate-300 text-slate-600"} disabled:opacity-40`}>PM · {periodIsOpen(selected, "pm", now) ? "Open" : "12:00 PM"}</button> : null}</div>
    <div className="mx-auto mt-5 flex aspect-square max-w-80 items-center justify-center rounded-lg border border-slate-200 bg-white p-3">{qrImage ? <img src={qrImage} alt={`${period.toUpperCase()} attendance QR for ${selected.courseName}`} className="h-full w-full object-contain" /> : <Loader2 className="h-6 w-6 animate-spin text-cyan-700" />}</div>
    <div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => void copyLink(selected, period)} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700"><Copy className="h-4 w-4" />Copy link</button><a href={qrImage || undefined} download={`${selected.courseName}-${period}-QR.png`} aria-disabled={!qrImage} className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-cyan-800 text-sm font-semibold text-white ${!qrImage ? "pointer-events-none opacity-50" : ""}`}><Download className="h-4 w-4" />Download QR</a></div><a href={checkInUrl(selected.token, period)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 text-sm font-semibold text-cyan-800"><ExternalLink className="h-4 w-4" />Open check-in form</a></div></div> : null}

  {rosterSession ? <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-5"><button type="button" className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setRosterSession(null)} aria-label="Close attendance list" /><section className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-xl"><header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6"><div><p className="text-xs font-bold uppercase text-cyan-800">Submitted attendance</p><h2 className="mt-1 text-xl font-bold text-slate-950">{rosterSession.courseName}</h2><p className="mt-1 text-sm text-slate-500">{formatDate(rosterSession.courseDate)}</p></div><button type="button" onClick={() => setRosterSession(null)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200"><X className="h-4 w-4" /></button></header>
    <div className="border-b border-slate-200 px-5 pt-4 sm:px-6"><div className="grid grid-cols-2 gap-2">{rosterSession.amEnabled ? <button type="button" onClick={() => setRosterPeriod("am")} className={`border-b-2 px-3 pb-3 text-sm font-bold transition ${rosterPeriod === "am" ? "border-cyan-700 text-cyan-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}>AM <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{rosterCounts.am}</span></button> : <div />}{rosterSession.pmEnabled ? <button type="button" onClick={() => setRosterPeriod("pm")} className={`border-b-2 px-3 pb-3 text-sm font-bold transition ${rosterPeriod === "pm" ? "border-cyan-700 text-cyan-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}>PM <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{rosterCounts.pm}</span></button> : <div />}</div></div>
    <div className="overflow-y-auto p-5 sm:p-6">{rosterLoading ? <div className="flex min-h-52 items-center justify-center gap-2 text-sm font-semibold text-slate-600"><Loader2 className="h-5 w-5 animate-spin text-cyan-700" />Loading submitted learners...</div> : roster.length ? <div className="space-y-2">{roster.map((item, index) => <article key={item.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-cyan-200 hover:bg-cyan-50/30"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-sm font-bold text-cyan-800">{index + 1}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{item.learnerName}</p><p className="mt-0.5 text-xs text-slate-500">ID ending XXXXX{item.lastFour}</p></div><div className="shrink-0 text-right"><p className="text-xs font-bold uppercase text-emerald-700">Submitted</p><p className="mt-1 text-xs text-slate-500">{formatSubmitted(item.submittedAt)}</p></div></article>)}</div> : <div className="flex min-h-52 flex-col items-center justify-center text-center"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400"><UsersRound className="h-6 w-6" /></div><h3 className="mt-3 font-bold text-slate-800">No {rosterPeriod.toUpperCase()} submissions yet</h3><p className="mt-1 text-sm text-slate-500">Learners will appear here immediately after submitting.</p></div>}</div>
    <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 sm:px-6"><span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"><UserCheck className="h-4 w-4 text-cyan-700" />{roster.length} submitted</span><button type="button" onClick={() => void openRoster(rosterSession)} disabled={rosterLoading} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><RefreshCw className={`h-4 w-4 ${rosterLoading ? "animate-spin" : ""}`} />Refresh</button></footer></section></div> : null}
  </AppShell>;
}
