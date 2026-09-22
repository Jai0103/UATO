"use client";

import QRCode from "qrcode";
import { CalendarDays, Copy, Download, ExternalLink, Loader2, QrCode, RefreshCw, X } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAppMessage } from "@/components/message-provider";
import { firebaseAuth, firebaseFunctions } from "@/lib/firebase-client";
import type { AttendancePeriod } from "@/lib/attendance";

type AssignedAttendanceSession = {
  id: string;
  token: string;
  courseName: string;
  courseCode: string;
  courseDate: string;
  instructorName: string;
  amOpen: boolean;
  pmOpen: boolean;
};

function checkInUrl(token: string, period: AttendancePeriod) {
  const basePath = window.location.pathname.startsWith("/UATO/") ? "/UATO" : "";
  return `${window.location.origin}${basePath}/attendance/check-in/?token=${encodeURIComponent(token)}&period=${period}`;
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-SG", { dateStyle: "medium" }).format(date);
}

export default function TrainerAttendancePage() {
  const message = useAppMessage();
  const [sessions, setSessions] = useState<AssignedAttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<AssignedAttendanceSession | null>(null);
  const [period, setPeriod] = useState<AttendancePeriod>("am");
  const [qrImage, setQrImage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      await firebaseAuth.authStateReady();
      if (!firebaseAuth.currentUser) throw new Error("Please sign in again.");
      const callable = httpsCallable<Record<string, never>, { sessions: AssignedAttendanceSession[] }>(
        firebaseFunctions,
        "listTrainerAttendanceSessions"
      );
      const result = await callable({});
      setSessions(result.data.sessions);
      setSelected(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selected) return;
    setQrImage("");
    void QRCode.toDataURL(checkInUrl(selected.token, period), {
      width: 900,
      margin: 3,
      errorCorrectionLevel: "H",
      color: { dark: "#102a43", light: "#ffffff" }
    }).then(setQrImage).catch(() => {
      setSelected(null);
      message.error("QR code failed", "Please try again.");
    });
  }, [selected, period, message]);

  function showQr(session: AssignedAttendanceSession) {
    setPeriod(session.amOpen ? "am" : "pm");
    setSelected(session);
  }

  async function copyLink(session: AssignedAttendanceSession, selectedPeriod: AttendancePeriod) {
    try {
      await navigator.clipboard.writeText(checkInUrl(session.token, selectedPeriod));
      message.success("Attendance link copied", `${selectedPeriod.toUpperCase()} check-in link is ready.`);
    } catch {
      message.error("Link could not be copied", "Please try again.");
    }
  }

  return <AppShell>
    <div className="app-page">
      <section className="app-page-header">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-cyan-800">Assigned sessions</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">QR Attendance</h1>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} title="Refresh sessions" aria-label="Refresh sessions" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 disabled:opacity-50"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </section>

      {loading ? <div className="flex min-h-48 items-center justify-center gap-3 text-sm font-semibold text-slate-600"><Loader2 className="h-5 w-5 animate-spin text-cyan-700" />Loading your attendance sessions...</div> : null}
      {!loading && loadError ? <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><p className="font-semibold">Attendance sessions could not be loaded</p><p className="mt-1">{loadError}</p><button type="button" onClick={() => void load()} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 font-semibold ring-1 ring-amber-200"><RefreshCw className="h-4 w-4" />Retry</button></section> : null}
      {!loading && !loadError && !sessions.length ? <section className="rounded-lg border border-slate-200 bg-white p-8 text-center"><QrCode className="mx-auto h-8 w-8 text-slate-300" /><h2 className="mt-3 font-bold text-slate-900">No open attendance sessions</h2><p className="mt-1 text-sm text-slate-600">Your administrator can assign a session to the email address on your account and open an AM or PM signing window.</p></section> : null}

      {!loading && !loadError ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sessions.map((session) => <article key={session.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="inline-flex rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Signing open</span><h2 className="mt-3 text-lg font-bold leading-6 text-slate-950">{session.courseName}</h2>{session.courseCode ? <p className="mt-1 text-sm text-slate-500">{session.courseCode}</p> : null}</div><QrCode className="h-5 w-5 shrink-0 text-cyan-800" /></div>
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-600"><CalendarDays className="h-4 w-4 text-slate-400" />{formatDate(session.courseDate)}</p>
          <div className="mt-3 flex gap-2">{session.amOpen ? <span className="rounded-md bg-cyan-50 px-2 py-1 text-xs font-bold text-cyan-800">AM</span> : null}{session.pmOpen ? <span className="rounded-md bg-cyan-50 px-2 py-1 text-xs font-bold text-cyan-800">PM</span> : null}</div>
          <button type="button" onClick={() => showQr(session)} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-800 px-3 text-sm font-bold text-white hover:bg-cyan-900"><QrCode className="h-4 w-4" />Show QR</button>
        </article>)}
      </div> : null}
    </div>

    {selected ? <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-5"><button type="button" className="absolute inset-0 bg-slate-950/60" onClick={() => setSelected(null)} aria-label="Close QR" /><div className="relative max-h-[95dvh] w-full overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-lg sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-cyan-800">Attendance check-in</p><h2 className="mt-1 text-xl font-bold text-slate-950">{selected.courseName}</h2><p className="mt-1 text-sm text-slate-600">{formatDate(selected.courseDate)}</p></div><button type="button" onClick={() => setSelected(null)} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200"><X className="h-4 w-4" /></button></div>
      <div className="mt-5 grid grid-cols-2 gap-2">{selected.amOpen ? <button type="button" onClick={() => setPeriod("am")} aria-pressed={period === "am"} className={`h-11 rounded-lg border text-sm font-bold ${period === "am" ? "border-cyan-700 bg-cyan-50 text-cyan-800" : "border-slate-300 text-slate-600"}`}>AM</button> : null}{selected.pmOpen ? <button type="button" onClick={() => setPeriod("pm")} aria-pressed={period === "pm"} className={`h-11 rounded-lg border text-sm font-bold ${period === "pm" ? "border-cyan-700 bg-cyan-50 text-cyan-800" : "border-slate-300 text-slate-600"}`}>PM</button> : null}</div>
      <div className="mx-auto mt-5 flex aspect-square max-w-80 items-center justify-center bg-white p-3">{qrImage ? <img src={qrImage} alt={`${period.toUpperCase()} attendance QR for ${selected.courseName}`} className="h-full w-full object-contain" /> : <Loader2 className="h-6 w-6 animate-spin text-cyan-700" />}</div>
      <div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => void copyLink(selected, period)} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700"><Copy className="h-4 w-4" />Copy link</button><a href={qrImage || undefined} download={`${selected.courseName}-${period}-QR.png`} aria-disabled={!qrImage} className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-cyan-800 text-sm font-semibold text-white ${!qrImage ? "pointer-events-none opacity-50" : ""}`}><Download className="h-4 w-4" />Download QR</a></div>
      <a href={checkInUrl(selected.token, period)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 text-sm font-semibold text-cyan-800"><ExternalLink className="h-4 w-4" />Open check-in form</a>
      <p className="mt-2 text-center text-xs text-slate-500">Display the QR only to learners present for this signing period.</p></div></div> : null}
  </AppShell>;
}
