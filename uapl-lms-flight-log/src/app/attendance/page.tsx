"use client";

import QRCode from "qrcode";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Download,
  Edit3,
  Eye,
  Loader2,
  Plus,
  QrCode,
  Search,
  Trash2,
  UsersRound,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import { getSecureSession } from "@/lib/auth-api";
import type {
  AttendancePeriod,
  AttendanceSchedule,
  AttendanceSession,
  AttendanceSessionInput,
  AttendanceSessionStatus,
  AttendanceSubmission
} from "@/lib/attendance";
import {
  deleteAttendanceSession,
  deleteAttendanceSubmission,
  fetchAttendanceSessions,
  fetchAttendanceSubmissions,
  saveAttendanceSession,
  updateAttendanceSubmission
} from "@/lib/attendance-api";
import { downloadAttendancePdf } from "@/lib/attendance-pdf";
import { fetchFirebaseUsers, type FirebaseManagedUser } from "@/lib/firebase-users-api";

const PAGE_SIZE = 10;
const inputClass = "mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-base text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-700 focus:ring-4 focus:ring-cyan-100 sm:h-11 sm:text-sm";

function todayValue() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function emptyForm(): AttendanceSessionInput {
  const user = getSecureSession();
  return {
    id: "",
    courseName: "",
    courseCode: "",
    courseDate: todayValue(),
    instructorName: user?.name || "",
    instructorEmail: user?.email || "",
    schedule: "full_day",
    status: "draft",
    amOpen: false,
    pmOpen: false,
    trainerComments: ""
  };
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
}

function statusStyle(status: AttendanceSessionStatus) {
  if (status === "open") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "closed") return "border-slate-300 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function attendanceUrl(token: string, period: AttendancePeriod) {
  if (typeof window === "undefined") return "";
  const basePath = window.location.pathname.startsWith("/UATO/") ? "/UATO" : "";
  return `${window.location.origin}${basePath}/attendance/check-in/?token=${encodeURIComponent(token)}&period=${period}`;
}

function Modal({ title, subtitle, onClose, children, width = "max-w-3xl" }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-5">
      <section className={`max-h-[94vh] w-full overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-xl ${width}`}>
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
          <div><h2 className="text-lg font-bold text-slate-950">{title}</h2>{subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}</div>
          <button type="button" onClick={onClose} className="app-icon-button flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200" aria-label="Close"><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

export default function AttendancePage() {
  const message = useAppMessage();
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [instructors, setInstructors] = useState<FirebaseManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AttendanceSessionStatus | "">("");
  const [year, setYear] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<AttendanceSessionInput | null>(null);
  const [qrSession, setQrSession] = useState<AttendanceSession | null>(null);
  const [qrPeriod, setQrPeriod] = useState<AttendancePeriod>("am");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [detailSession, setDetailSession] = useState<AttendanceSession | null>(null);
  const [submissions, setSubmissions] = useState<AttendanceSubmission[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingSubmission, setEditingSubmission] = useState<AttendanceSubmission | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await fetchAttendanceSessions());
    } catch (error) {
      message.error("Unable to load attendance", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  useEffect(() => {
    void fetchFirebaseUsers()
      .then((users) => setInstructors(users.filter((user) => user.status === "active" && user.email)))
      .catch((error) => message.error("Instructor list unavailable", error instanceof Error ? error.message : "Refresh the page to try again."));
  }, [message]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sessions.filter((session) => {
      if (status && session.status !== status) return false;
      if (year && !session.courseDate.startsWith(year)) return false;
      if (!query) return true;
      return [session.courseName, session.courseCode, session.instructorName].some((value) => value.toLowerCase().includes(query));
    });
  }, [search, sessions, status, year]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((Math.min(page, totalPages) - 1) * PAGE_SIZE, Math.min(page, totalPages) * PAGE_SIZE);
  const openCount = sessions.filter((item) => item.status === "open").length;
  const years = useMemo(() => Array.from(new Set(sessions.map((item) => item.courseDate.slice(0, 4)).filter(Boolean))).sort().reverse(), [sessions]);
  const metrics: Array<{
    label: string;
    value: number;
    icon: typeof CalendarDays;
    color: string;
  }> = [
    { label: "Sessions", value: sessions.length, icon: CalendarDays, color: "text-sky-700 bg-sky-50" },
    { label: "Open now", value: openCount, icon: CheckCircle2, color: "text-emerald-700 bg-emerald-50" },
    { label: "This month", value: sessions.filter((item) => item.courseDate.startsWith(todayValue().slice(0, 7))).length, icon: ClipboardCheck, color: "text-violet-700 bg-violet-50" },
    { label: "Report ready", value: sessions.filter((item) => item.status === "closed").length, icon: Download, color: "text-amber-700 bg-amber-50" }
  ];

  useEffect(() => setPage(1), [search, status, year]);

  useEffect(() => {
    if (!qrSession) return;
    const url = attendanceUrl(qrSession.token, qrPeriod);
    setQrDataUrl("");
    QRCode.toDataURL(url, { width: 900, margin: 3, errorCorrectionLevel: "H", color: { dark: "#102a43", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => message.error("QR code failed", "Please close the window and try again."));
  }, [message, qrPeriod, qrSession]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || working) return;
    if (!form.courseName.trim() || !form.courseDate || !form.instructorName.trim() || !form.instructorEmail.trim()) {
      message.warning("Complete required fields", "Course name, date, and an assigned instructor account are required.");
      return;
    }
    setWorking("save");
    message.notify({ type: "loading", title: form.id ? "Updating attendance session" : "Creating attendance session", message: "Saving securely to Firebase." });
    try {
      const normalized = {
        ...form,
        amOpen: form.status === "open" && form.schedule !== "pm" && form.amOpen,
        pmOpen: form.status === "open" && form.schedule !== "am" && form.pmOpen
      };
      await saveAttendanceSession(normalized);
      setForm(null);
      await loadSessions();
      message.success("Attendance session saved", "The QR controls are ready.");
    } catch (error) {
      message.error("Save failed", error instanceof Error ? error.message : "Please try again.");
    } finally { setWorking(""); }
  }

  function editSession(session: AttendanceSession) {
    setForm({
      id: session.id, courseName: session.courseName, courseCode: session.courseCode,
      courseDate: session.courseDate, instructorName: session.instructorName,
      instructorEmail: session.instructorEmail, schedule: session.schedule, status: session.status,
      amOpen: session.amOpen, pmOpen: session.pmOpen, trainerComments: session.trainerComments
    });
  }

  async function removeSession(session: AttendanceSession) {
    const confirmed = await message.confirm({ title: "Delete attendance session?", message: `This permanently removes ${session.courseName} and all captured signatures.`, confirmLabel: "Delete", variant: "danger" });
    if (!confirmed) return;
    setWorking(`delete-${session.id}`);
    try {
      await deleteAttendanceSession(session);
      await loadSessions();
      message.success("Attendance session deleted");
    } catch (error) { message.error("Delete failed", error instanceof Error ? error.message : "Please try again."); }
    finally { setWorking(""); }
  }

  async function openDetail(session: AttendanceSession) {
    setDetailSession(session); setDetailLoading(true); setSubmissions([]);
    try { setSubmissions(await fetchAttendanceSubmissions(session.id)); }
    catch (error) { message.error("Unable to load attendees", error instanceof Error ? error.message : "Please try again."); }
    finally { setDetailLoading(false); }
  }

  async function removeSubmission(submission: AttendanceSubmission) {
    const confirmed = await message.confirm({ title: "Remove attendance entry?", message: `Remove ${submission.learnerName}'s ${submission.period.toUpperCase()} attendance?`, confirmLabel: "Remove", variant: "danger" });
    if (!confirmed || !detailSession) return;
    setWorking(`entry-${submission.id}`);
    try {
      await deleteAttendanceSubmission(submission.id);
      setSubmissions(await fetchAttendanceSubmissions(detailSession.id));
      message.success("Attendance entry removed");
    } catch (error) { message.error("Remove failed", error instanceof Error ? error.message : "Please try again."); }
    finally { setWorking(""); }
  }

  async function saveSubmissionEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingSubmission || !detailSession) return;
    setWorking(`edit-${editingSubmission.id}`);
    try {
      await updateAttendanceSubmission(editingSubmission.id, editingSubmission);
      setSubmissions(await fetchAttendanceSubmissions(detailSession.id));
      setEditingSubmission(null);
      message.success("Attendance entry updated");
    } catch (error) { message.error("Update failed", error instanceof Error ? error.message : "Please try again."); }
    finally { setWorking(""); }
  }

  async function downloadPdf(session: AttendanceSession, knownSubmissions?: AttendanceSubmission[]) {
    setWorking(`pdf-${session.id}`);
    message.notify({ type: "loading", title: "Preparing attendance PDF", message: "Formatting names and signatures." });
    try {
      const records = knownSubmissions || await fetchAttendanceSubmissions(session.id);
      await downloadAttendancePdf(session, records);
      message.success("Attendance PDF downloaded");
    } catch (error) { message.error("PDF download failed", error instanceof Error ? error.message : "Please try again."); }
    finally { setWorking(""); }
  }

  async function copyQrLink() {
    if (!qrSession) return;
    await navigator.clipboard.writeText(attendanceUrl(qrSession.token, qrPeriod));
    message.success("Attendance link copied", `${qrPeriod.toUpperCase()} check-in link is ready to share.`);
  }

  if (loading) return <AppShell><LoadingOverlay label="Loading attendance" description="Retrieving QR sessions and attendance records..." /></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="app-page-header relative overflow-hidden rounded-xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-7">
          <div className="absolute inset-y-0 left-0 w-1 bg-cyan-700" />
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div><div className="inline-flex items-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold uppercase text-cyan-800"><ClipboardCheck size={14} /> Training attendance</div><h1 className="mt-3 text-2xl font-bold text-slate-950 sm:text-3xl">QR Attendance</h1><p className="mt-1 text-sm text-slate-500">Create secure signing windows, monitor attendance, and generate the official AGA report.</p></div>
            <button type="button" onClick={() => setForm(emptyForm())} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-cyan-800 px-4 text-sm font-bold text-white shadow-lg shadow-cyan-900/15 hover:bg-cyan-900"><Plus size={17} /> New attendance</button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon, color }) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}><Icon size={19} /></div><div className="mt-3 text-2xl font-bold text-slate-950">{value}</div><div className="text-xs font-semibold uppercase text-slate-500">{label}</div></div>)}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-[minmax(240px,1fr)_180px_150px]">
            <label className="relative"><Search className="absolute left-3 top-3.5 text-slate-400" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-cyan-700" placeholder="Search course, code, or instructor" /></label>
            <select value={status} onChange={(event) => setStatus(event.target.value as AttendanceSessionStatus | "")} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">All statuses</option><option value="draft">Draft</option><option value="open">Open</option><option value="closed">Closed</option></select>
            <select value={year} onChange={(event) => setYear(event.target.value)} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">All years</option>{years.map((item) => <option key={item}>{item}</option>)}</select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="app-table-header bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Course</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Instructor</th><th className="px-4 py-3">Schedule</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((session) => (
                  <tr key={session.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-4"><div className="font-bold text-slate-900">{session.courseName}</div><div className="mt-0.5 text-xs text-slate-500">{session.courseCode || "No course code"}</div></td>
                    <td className="px-4 py-4 font-medium text-slate-700">{formatDate(session.courseDate)}</td>
                    <td className="px-4 py-4 text-slate-700">{session.instructorName}</td>
                    <td className="px-4 py-4 capitalize text-slate-600">{session.schedule.replace("_", " ")}</td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${statusStyle(session.status)}`}>{session.status}</span></td>
                    <td className="px-5 py-4"><div className="flex justify-end gap-1.5"><button onClick={() => void openDetail(session)} className="app-icon-button flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200" title="View attendance"><Eye size={16} /></button><button onClick={() => { setQrPeriod(session.schedule === "pm" ? "pm" : "am"); setQrSession(session); }} className="app-icon-button flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200" title="Show QR"><QrCode size={16} /></button><button onClick={() => editSession(session)} className="app-icon-button flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200" title="Edit"><Edit3 size={16} /></button><button onClick={() => void downloadPdf(session)} disabled={working === `pdf-${session.id}`} className="app-icon-button flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200" title="Download PDF">{working === `pdf-${session.id}` ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}</button><button onClick={() => void removeSession(session)} disabled={working === `delete-${session.id}`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50" title="Delete"><Trash2 size={16} /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visible.length ? <div className="px-5 py-16 text-center"><UsersRound className="mx-auto text-slate-300" size={34} /><p className="mt-3 font-semibold text-slate-700">No attendance sessions found</p><p className="mt-1 text-sm text-slate-500">Create a session or adjust the filters.</p></div> : null}
          <footer className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm text-slate-500"><span>{filtered.length} session{filtered.length === 1 ? "" : "s"}</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="app-icon-button flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40"><ChevronLeft size={17} /></button><span className="min-w-20 text-center text-xs font-bold uppercase">{Math.min(page, totalPages)} / {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="app-icon-button flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40"><ChevronRight size={17} /></button></div></footer>
        </section>
      </div>

      {form ? <Modal title={form.id ? "Edit attendance session" : "New attendance session"} subtitle="Configure the course and control which signing periods are open." onClose={() => setForm(null)}>
        <form onSubmit={handleSave} className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">Course name *<input className={inputClass} value={form.courseName} onChange={(event) => setForm({ ...form, courseName: event.target.value })} placeholder="e.g. UAPL Theory" /></label><label className="text-sm font-semibold text-slate-700">Course code<input className={inputClass} value={form.courseCode} onChange={(event) => setForm({ ...form, courseCode: event.target.value })} placeholder="e.g. UAPL-TM" /></label><label className="text-sm font-semibold text-slate-700">Course date *<input type="date" className={inputClass} value={form.courseDate} onChange={(event) => setForm({ ...form, courseDate: event.target.value })} /></label><label className="text-sm font-semibold text-slate-700">Assigned instructor *<select className={inputClass} value={form.instructorEmail} onChange={(event) => { const selected = instructors.find((user) => user.email === event.target.value); setForm({ ...form, instructorEmail: selected?.email || "", instructorName: selected?.name || "" }); }}><option value="">Select an account</option>{form.instructorEmail && !instructors.some((user) => user.email === form.instructorEmail) ? <option value={form.instructorEmail}>{form.instructorName || form.instructorEmail} (previous assignment)</option> : null}{instructors.map((user) => <option key={user.id} value={user.email}>{user.name} ({user.email})</option>)}</select></label></div>
          <div><span className="text-sm font-semibold text-slate-700">Schedule</span><div className="mt-2 grid grid-cols-3 gap-2">{(["am", "pm", "full_day"] as AttendanceSchedule[]).map((item) => <button type="button" key={item} onClick={() => setForm({ ...form, schedule: item, amOpen: item !== "pm" && form.amOpen, pmOpen: item !== "am" && form.pmOpen })} className={`h-11 rounded-lg border text-sm font-bold capitalize ${form.schedule === item ? "border-cyan-700 bg-cyan-50 text-cyan-800" : "border-slate-300 text-slate-600"}`}>{item.replace("_", " ")}</button>)}</div></div>
          <div className="grid gap-4 sm:grid-cols-3"><label className="text-sm font-semibold text-slate-700">Session status<select className={inputClass} value={form.status} onChange={(event) => { const next = event.target.value as AttendanceSessionStatus; setForm({ ...form, status: next, amOpen: next === "open" && form.amOpen, pmOpen: next === "open" && form.pmOpen }); }}><option value="draft">Draft</option><option value="open">Open</option><option value="closed">Closed</option></select></label><label className={`mt-7 flex h-12 items-center gap-3 rounded-lg border px-3 text-sm font-semibold ${form.schedule === "pm" ? "opacity-40" : ""}`}><input type="checkbox" disabled={form.status !== "open" || form.schedule === "pm"} checked={form.amOpen} onChange={(event) => setForm({ ...form, amOpen: event.target.checked })} className="h-5 w-5" /> AM signing open</label><label className={`mt-7 flex h-12 items-center gap-3 rounded-lg border px-3 text-sm font-semibold ${form.schedule === "am" ? "opacity-40" : ""}`}><input type="checkbox" disabled={form.status !== "open" || form.schedule === "am"} checked={form.pmOpen} onChange={(event) => setForm({ ...form, pmOpen: event.target.checked })} className="h-5 w-5" /> PM signing open</label></div>
          <label className="block text-sm font-semibold text-slate-700">Trainer comments / observations<textarea rows={4} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm outline-none focus:border-cyan-700" value={form.trainerComments} onChange={(event) => setForm({ ...form, trainerComments: event.target.value })} /></label>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={() => setForm(null)} className="app-button-secondary h-11 rounded-lg border border-slate-300 px-5 text-sm font-bold">Cancel</button><button disabled={working === "save"} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-cyan-800 px-5 text-sm font-bold text-white disabled:opacity-60">{working === "save" ? <Loader2 className="animate-spin" size={17} /> : <CheckCircle2 size={17} />} Save session</button></div>
        </form>
      </Modal> : null}

      {qrSession ? <Modal title={`${qrSession.courseName} QR`} subtitle={`${formatDate(qrSession.courseDate)} - ${qrPeriod.toUpperCase()} attendance`} onClose={() => setQrSession(null)} width="max-w-xl">
        <div className="p-5 sm:p-6"><div className="grid grid-cols-2 gap-2">{(["am", "pm"] as AttendancePeriod[]).filter((item) => qrSession.schedule === "full_day" || qrSession.schedule === item).map((item) => <button type="button" key={item} onClick={() => setQrPeriod(item)} className={`h-11 rounded-lg border text-sm font-bold ${qrPeriod === item ? "border-cyan-700 bg-cyan-50 text-cyan-800" : "border-slate-300 text-slate-600"}`}>{item.toUpperCase()}</button>)}</div><div className="mx-auto mt-5 aspect-square max-w-[360px] overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-inner">{qrDataUrl ? <img src={qrDataUrl} alt={`${qrPeriod.toUpperCase()} attendance QR code`} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-cyan-700" /></div>}</div><div className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => void copyQrLink()} className="app-button-secondary inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 text-sm font-bold"><Copy size={16} /> Copy link</button><a href={qrDataUrl} download={`${qrSession.courseName}-${qrPeriod}-QR.png`} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-cyan-800 text-sm font-bold text-white"><Download size={16} /> Download QR</a></div><p className="mt-4 text-center text-xs text-slate-500">Only learners physically present should scan this code. The link accepts one submission per learner for this period.</p></div>
      </Modal> : null}

      {detailSession ? <Modal title={detailSession.courseName} subtitle={`${formatDate(detailSession.courseDate)} - ${submissions.length} signed period${submissions.length === 1 ? "" : "s"}`} onClose={() => setDetailSession(null)} width="max-w-5xl">
        <div className="p-5 sm:p-6"><div className="mb-4 flex flex-col gap-2 sm:flex-row sm:justify-end"><button onClick={() => editSession(detailSession)} className="app-button-secondary inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-bold"><Edit3 size={16} /> Edit session</button><button onClick={() => void downloadPdf(detailSession, submissions)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-cyan-800 px-4 text-sm font-bold text-white"><Download size={16} /> Download PDF</button></div>{detailLoading ? <div className="flex min-h-52 items-center justify-center"><Loader2 className="animate-spin text-cyan-700" /></div> : <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[720px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Learner</th><th className="px-4 py-3">Last 4</th><th className="px-4 py-3">Period</th><th className="px-4 py-3">Signed at</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{submissions.map((entry) => <tr key={entry.id}><td className="px-4 py-3 font-semibold text-slate-900">{entry.learnerName}</td><td className="px-4 py-3 text-slate-600">{entry.lastFour}</td><td className="px-4 py-3"><span className="rounded-full bg-cyan-50 px-2 py-1 text-xs font-bold uppercase text-cyan-800">{entry.period}</span></td><td className="px-4 py-3 text-slate-500">{entry.submittedAt ? new Date(entry.submittedAt).toLocaleString("en-SG") : "-"}</td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button onClick={() => setEditingSubmission(entry)} className="app-icon-button flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200"><Edit3 size={15} /></button><button onClick={() => void removeSubmission(entry)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 text-rose-600"><Trash2 size={15} /></button></div></td></tr>)}</tbody></table>{!submissions.length ? <div className="p-12 text-center text-sm text-slate-500">No learner has signed this session yet.</div> : null}</div>}</div>
      </Modal> : null}

      {editingSubmission ? <Modal title="Correct attendance entry" subtitle="Use this only to correct an obvious learner input error." onClose={() => setEditingSubmission(null)} width="max-w-lg"><form onSubmit={saveSubmissionEdit} className="space-y-4 p-5 sm:p-6"><label className="block text-sm font-semibold text-slate-700">Name as per NRIC / passport<input className={inputClass} value={editingSubmission.learnerName} onChange={(event) => setEditingSubmission({ ...editingSubmission, learnerName: event.target.value })} /></label><label className="block text-sm font-semibold text-slate-700">Last 4 characters<input maxLength={4} className={`${inputClass} uppercase`} value={editingSubmission.lastFour} onChange={(event) => setEditingSubmission({ ...editingSubmission, lastFour: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} /></label><button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-800 font-bold text-white"><CheckCircle2 size={17} /> Save correction</button></form></Modal> : null}
    </AppShell>
  );
}
