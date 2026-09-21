"use client";

import QRCode from "qrcode";
import { CalendarDays, Copy, ExternalLink, Loader2, MapPin, QrCode, RefreshCw, X } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAppMessage } from "@/components/message-provider";
import { firebaseAuth, firebaseFunctions } from "@/lib/firebase-client";

type TrainerEvaluationSession = {
  id: string;
  token: string;
  courseName: string;
  trainingDate: string;
  location: string;
  trainerName: string;
  opensAt: string;
  closesAt: string;
};

function evaluationUrl(token: string) {
  return `${window.location.origin}/UATO/evaluation/?token=${encodeURIComponent(token)}`;
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-SG", { dateStyle: "medium" }).format(date);
}

export default function TrainerEvaluationsPage() {
  const message = useAppMessage();
  const [sessions, setSessions] = useState<TrainerEvaluationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TrainerEvaluationSession | null>(null);
  const [qrImage, setQrImage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await firebaseAuth.authStateReady();
      if (!firebaseAuth.currentUser) throw new Error("Please sign in again.");
      const call = httpsCallable<Record<string, never>, { sessions: TrainerEvaluationSession[] }>(
        firebaseFunctions,
        "listTrainerEvaluationSessions"
      );
      const result = await call({});
      setSessions(result.data.sessions);
    } catch (error) {
      message.error(
        "Evaluation sessions could not be loaded",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { void load(); }, [load]);

  async function showQr(session: TrainerEvaluationSession) {
    setSelected(session);
    setQrImage("");
    try {
      const image = await QRCode.toDataURL(evaluationUrl(session.token), {
        width: 960,
        margin: 3,
        errorCorrectionLevel: "H",
        color: { dark: "#102a43", light: "#ffffff" }
      });
      setQrImage(image);
    } catch {
      setSelected(null);
      message.error("QR could not be generated", "Please try again.");
    }
  }

  async function copyLink(session: TrainerEvaluationSession) {
    try {
      await navigator.clipboard.writeText(evaluationUrl(session.token));
      message.success("Link copied", "Share the evaluation link with learners.");
    } catch {
      message.error("Link could not be copied", "Please try again.");
    }
  }

  return <AppShell>
    <div className="app-page">
      <section className="app-page-header">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700 ring-1 ring-violet-100"><QrCode className="h-3.5 w-3.5" /> Course feedback</div>
            <h1 className="mt-3 text-2xl font-bold text-slate-950 sm:text-3xl">Student Evaluations</h1>
            <p className="mt-1 text-sm leading-6 text-slate-600">Show the QR code for your open course sessions.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} title="Refresh sessions" aria-label="Refresh sessions" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 disabled:opacity-50"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </section>

      {loading ? <div className="flex min-h-48 items-center justify-center gap-3 text-sm font-semibold text-slate-600"><Loader2 className="h-5 w-5 animate-spin text-sky-700" />Loading your sessions...</div> : null}
      {!loading && !sessions.length ? <section className="rounded-lg border border-slate-200 bg-white p-8 text-center"><QrCode className="mx-auto h-8 w-8 text-slate-300" /><h2 className="mt-3 font-bold text-slate-900">No open evaluation sessions</h2><p className="mt-1 text-sm text-slate-600">Your administrator can assign a session using the email address on your account.</p></section> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sessions.map((session) => <article key={session.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Open</span><h2 className="mt-3 text-lg font-bold leading-6 text-slate-950">{session.courseName}</h2></div><QrCode className="h-5 w-5 shrink-0 text-sky-700" /></div>
          <div className="mt-4 space-y-2 text-sm text-slate-600"><p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-slate-400" />{formatDate(session.trainingDate)}</p><p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400" />{session.location || "Location not specified"}</p></div>
          <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => void showQr(session)} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 text-sm font-bold text-white hover:bg-sky-800"><QrCode className="h-4 w-4" />Show QR</button><button type="button" onClick={() => void copyLink(session)} title="Copy learner link" aria-label="Copy learner link" className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700"><Copy className="h-4 w-4" /></button></div>
        </article>)}
      </div>
    </div>

    {selected ? <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-5"><button type="button" className="absolute inset-0 bg-slate-950/60" onClick={() => setSelected(null)} aria-label="Close QR" /><div className="relative max-h-[95dvh] w-full overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-lg sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-violet-700">Student evaluation</p><h2 className="mt-1 text-xl font-bold text-slate-950">{selected.courseName}</h2><p className="mt-1 text-sm text-slate-600">{formatDate(selected.trainingDate)}</p></div><button type="button" onClick={() => setSelected(null)} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200"><X className="h-4 w-4" /></button></div><div className="mt-5 flex min-h-64 items-center justify-center rounded-lg border border-slate-200 bg-white p-3">{qrImage ? <img src={qrImage} alt={`QR for ${selected.courseName}`} className="aspect-square w-full max-w-72" /> : <Loader2 className="h-6 w-6 animate-spin text-sky-700" />}</div><div className="mt-4 flex gap-2"><button type="button" onClick={() => void copyLink(selected)} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700"><Copy className="h-4 w-4" />Copy link</button><a href={evaluationUrl(selected.token)} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-sky-700 text-sm font-semibold text-white"><ExternalLink className="h-4 w-4" />Open form</a></div></div></div> : null}
  </AppShell>;
}
