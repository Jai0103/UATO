"use client";

import { CheckCircle2, Loader2, PenLine, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import type { AttendancePeriod, PublicAttendanceSession } from "@/lib/attendance";
import { fetchPublicAttendanceSession, submitPublicAttendance } from "@/lib/attendance-api";

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-SG", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function SignaturePad({ onChange }: { onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [signed, setSigned] = useState(false);

  function prepareCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width === Math.round(rect.width * ratio) && canvas.height === Math.round(rect.height * ratio)) return;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const context = canvas.getContext("2d");
    context?.scale(ratio, ratio);
    if (context) {
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 2.2;
      context.strokeStyle = "#102a43";
    }
  }

  useEffect(() => {
    prepareCanvas();
    window.addEventListener("resize", prepareCanvas);
    return () => window.removeEventListener("resize", prepareCanvas);
  }, []);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const context = event.currentTarget.getContext("2d");
    const next = point(event);
    context?.beginPath();
    context?.moveTo(next.x, next.y);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d");
    const next = point(event);
    context?.lineTo(next.x, next.y);
    context?.stroke();
    if (!signed) setSigned(true);
  }

  function finish(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    event.currentTarget.getContext("2d")?.closePath();
    const value = event.currentTarget.toDataURL("image/png", 0.72);
    onChange(value);
    setSigned(true);
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setSigned(false);
    onChange("");
  }

  return (
    <div>
      <div className="relative mt-2 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-inner">
        <canvas ref={canvasRef} className="block h-44 w-full touch-none cursor-crosshair" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} aria-label="Signature pad" />
        {!signed ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400"><PenLine className="mr-2" size={18} /> Sign inside this box</div> : null}
        <div className="pointer-events-none absolute bottom-8 left-5 right-5 border-b border-slate-300" />
      </div>
      <button type="button" onClick={clear} className="mt-2 inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700"><RotateCcw size={15} /> Clear signature</button>
    </div>
  );
}

export default function AttendanceCheckInPage() {
  const [token, setToken] = useState("");
  const [period, setPeriod] = useState<AttendancePeriod>("am");
  const [session, setSession] = useState<PublicAttendanceSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [learnerName, setLearnerName] = useState("");
  const [lastFour, setLastFour] = useState("");
  const [signature, setSignature] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const nextToken = parameters.get("token") || "";
    const nextPeriod = parameters.get("period") === "pm" ? "pm" : "am";
    setToken(nextToken);
    setPeriod(nextPeriod);
    if (!nextToken) {
      setError("This attendance link is incomplete. Please scan the QR code again.");
      setLoading(false);
      return;
    }
    fetchPublicAttendanceSession(nextToken)
      .then(setSession)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load attendance."))
      .finally(() => setLoading(false));
  }, []);

  const periodOpen = session?.status === "open" && (period === "am" ? session.amOpen : session.pmOpen);
  const scheduleAllowsPeriod = session?.schedule === "full_day" || session?.schedule === period;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || submitting) return;
    setError("");
    if (!signature) { setError("Please sign before submitting your attendance."); return; }
    setSubmitting(true);
    try {
      await submitPublicAttendance({ session, period, learnerName, lastFour, signatureDataUrl: signature });
      setSuccess(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Attendance could not be submitted. Please try again.");
    } finally { setSubmitting(false); }
  }

  return (
    <main className="min-h-screen bg-[#edf3f7] px-4 py-6 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-xl">
        <header className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <img src="/UATO/aga-horizontal-logo.png" alt="Apollo Global Academy" className="h-11 w-auto max-w-[190px] object-contain" />
          <div className="text-right"><div className="text-xs font-bold uppercase tracking-wide text-cyan-800">Training Operations</div><div className="text-sm font-bold text-slate-800">Digital Attendance</div></div>
        </header>

        {loading ? <section className="flex min-h-72 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm"><div className="text-center"><Loader2 className="mx-auto animate-spin text-cyan-700" size={30} /><p className="mt-3 font-bold">Opening attendance</p><p className="mt-1 text-sm text-slate-500">Verifying the signing window...</p></div></section> : null}

        {!loading && error && !session ? <section className="rounded-xl border border-rose-200 bg-white p-6 text-center shadow-sm"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-700"><ShieldCheck size={24} /></div><h1 className="mt-4 text-xl font-bold">Attendance unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-600">{error}</p></section> : null}

        {!loading && session ? <>
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-l-4 border-cyan-700 px-5 py-5"><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold uppercase text-cyan-800">{period} attendance</span><span className={`h-2.5 w-2.5 rounded-full ${periodOpen && scheduleAllowsPeriod ? "bg-emerald-500" : "bg-slate-300"}`} /></div><h1 className="mt-3 text-2xl font-bold text-slate-950">{session.courseName}</h1><dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-2 text-sm"><dt className="text-slate-500">Course code</dt><dd className="font-semibold">{session.courseCode || "-"}</dd><dt className="text-slate-500">Date</dt><dd className="font-semibold">{formatDate(session.courseDate)}</dd><dt className="text-slate-500">Instructor</dt><dd className="font-semibold">{session.instructorName}</dd></dl></div>
          </section>

          {success ? <section className="mt-5 rounded-xl border border-emerald-200 bg-white p-7 text-center shadow-sm"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 size={30} /></div><h2 className="mt-4 text-2xl font-bold">Attendance recorded</h2><p className="mt-2 text-sm leading-6 text-slate-600">Your {period.toUpperCase()} attendance for <strong>{session.courseName}</strong> has been submitted successfully.</p><p className="mt-5 text-xs text-slate-500">You may close this page.</p></section> : null}

          {!success && (!periodOpen || !scheduleAllowsPeriod) ? <section className="mt-5 rounded-xl border border-amber-200 bg-white p-6 text-center shadow-sm"><h2 className="text-xl font-bold">Signing is not open</h2><p className="mt-2 text-sm leading-6 text-slate-600">The instructor has not opened the {period.toUpperCase()} attendance window. Please confirm that you scanned the correct QR code.</p></section> : null}

          {!success && periodOpen && scheduleAllowsPeriod ? <form onSubmit={handleSubmit} className="mt-5 space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div><h2 className="text-lg font-bold">Confirm your attendance</h2><p className="mt-1 text-sm text-slate-500">Enter your details exactly as shown on your identification document.</p></div>
            <label className="block text-sm font-semibold text-slate-700">Name as per NRIC / passport<input autoComplete="name" value={learnerName} onChange={(event) => setLearnerName(event.target.value)} className="mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-base outline-none focus:border-cyan-700 focus:ring-4 focus:ring-cyan-100" placeholder="Full legal name" /></label>
            <label className="block text-sm font-semibold text-slate-700">Last 4 characters of NRIC / FIN / travel document
              <span className="mt-2 flex h-12 w-full items-center rounded-lg border border-slate-300 bg-white px-3.5 focus-within:border-cyan-700 focus-within:ring-4 focus-within:ring-cyan-100">
                <span aria-hidden="true" className="shrink-0 text-base font-medium text-slate-400">XXXXX</span>
                <input inputMode="text" autoCapitalize="characters" maxLength={4} value={lastFour} onChange={(event) => setLastFour(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} className="min-w-0 flex-1 border-0 bg-transparent p-0 text-base font-bold uppercase text-slate-900 outline-none focus:ring-0" placeholder="123A" />
              </span>
            </label>
            <label className="block text-sm font-semibold text-slate-700">Signature<SignaturePad onChange={setSignature} /></label>
            {error ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</div> : null}
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600"><ShieldCheck className="mt-0.5 shrink-0 text-cyan-700" size={18} /><span>By submitting, I confirm that I personally attended this training period and that the information provided is accurate.</span></label>
            <button disabled={submitting} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-cyan-800 text-base font-bold text-white shadow-lg shadow-cyan-900/15 hover:bg-cyan-900 disabled:opacity-60">{submitting ? <Loader2 className="animate-spin" size={19} /> : <CheckCircle2 size={19} />}{submitting ? "Submitting attendance..." : "Submit attendance"}</button>
          </form> : null}
        </> : null}
        <footer className="py-6 text-center text-xs text-slate-500">Apollo Global Academy - Secure attendance capture</footer>
      </div>
    </main>
  );
}
