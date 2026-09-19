"use client";

import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  Eye,
  Loader2,
  Search,
  Trash2,
  UsersRound,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import type {
  AttendanceRecordSummary,
  AttendanceSessionStatus,
  AttendanceSubmission
} from "@/lib/attendance";
import {
  deleteAttendanceSession,
  fetchAttendanceRecordSummaries,
  fetchAttendanceSubmissions
} from "@/lib/attendance-api";
import { downloadAttendancePdf } from "@/lib/attendance-pdf";

const PAGE_SIZE = 10;

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-SG", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-SG", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
}

function statusStyle(status: AttendanceSessionStatus) {
  if (status === "open") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "closed") return "border-slate-300 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function Modal({ title, subtitle, onClose, children }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-5">
      <section className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="app-icon-button flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200" aria-label="Close">
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export default function AttendanceRecordsPage() {
  const message = useAppMessage();
  const [records, setRecords] = useState<AttendanceRecordSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AttendanceSessionStatus | "">("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AttendanceRecordSummary | null>(null);
  const [submissions, setSubmissions] = useState<AttendanceSubmission[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadRecords = useCallback(async () => {
    try {
      setRecords(await fetchAttendanceRecordSummaries());
    } catch (error) {
      message.error(
        "Unable to load attendance records",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { void loadRecords(); }, [loadRecords]);

  const years = useMemo(
    () => Array.from(new Set(records.map((item) => item.courseDate.slice(0, 4)).filter(Boolean))).sort().reverse(),
    [records]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      if (status && record.status !== status) return false;
      if (year && !record.courseDate.startsWith(year)) return false;
      if (month && record.courseDate.slice(5, 7) !== month) return false;
      if (!query) return true;
      return [record.courseName, record.courseCode, record.instructorName].some((value) =>
        value.toLowerCase().includes(query)
      );
    });
  }, [month, records, search, status, year]);

  useEffect(() => setPage(1), [month, search, status, year]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const totalLearners = filtered.reduce((total, item) => total + item.uniqueLearnerCount, 0);
  const totalSignatures = filtered.reduce((total, item) => total + item.amCount + item.pmCount, 0);

  async function openRecord(record: AttendanceRecordSummary) {
    setSelected(record);
    setSubmissions([]);
    setDetailLoading(true);
    try {
      setSubmissions(await fetchAttendanceSubmissions(record.id));
    } catch (error) {
      message.error("Unable to open record", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function downloadRecord(record: AttendanceRecordSummary, known?: AttendanceSubmission[]) {
    setWorking(`pdf-${record.id}`);
    message.notify({ type: "loading", title: "Preparing attendance PDF", message: "Formatting attendance and signatures." });
    try {
      const items = known || await fetchAttendanceSubmissions(record.id);
      await downloadAttendancePdf(record, items);
      message.success("Attendance PDF downloaded");
    } catch (error) {
      message.error("PDF download failed", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setWorking("");
    }
  }

  async function removeRecord(record: AttendanceRecordSummary) {
    const confirmed = await message.confirm({
      title: "Delete attendance record?",
      message: `This permanently removes ${record.courseName}, its learner entries, and captured signatures.`,
      confirmLabel: "Delete record",
      variant: "danger"
    });
    if (!confirmed) return;
    setWorking(`delete-${record.id}`);
    try {
      await deleteAttendanceSession(record);
      if (selected?.id === record.id) setSelected(null);
      await loadRecords();
      message.success("Attendance record deleted");
    } catch (error) {
      message.error("Delete failed", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setWorking("");
    }
  }

  if (loading) {
    return <AppShell><LoadingOverlay label="Loading attendance records" description="Retrieving sessions and signature totals from Firebase..." /></AppShell>;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-7">
          <div className="absolute inset-y-0 left-0 w-1 bg-violet-600" />
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold uppercase text-violet-800"><ClipboardCheck size={14} /> Records register</div>
              <h1 className="mt-3 text-2xl font-bold text-slate-950 sm:text-3xl">Attendance Records</h1>
              <p className="mt-1 text-sm text-slate-500">Review course attendance, signature periods, and official reports.</p>
            </div>
            <Link href="/attendance" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 text-sm font-bold text-white shadow-lg shadow-violet-900/15 hover:bg-violet-800"><CalendarDays size={17} /> Manage QR attendance</Link>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase text-slate-500">Matching sessions</div><div className="mt-2 text-2xl font-bold text-slate-950">{filtered.length}</div></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase text-slate-500">Unique learners</div><div className="mt-2 text-2xl font-bold text-slate-950">{totalLearners}</div></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase text-slate-500">AM signatures</div><div className="mt-2 text-2xl font-bold text-sky-700">{filtered.reduce((total, item) => total + item.amCount, 0)}</div></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase text-slate-500">All signatures</div><div className="mt-2 text-2xl font-bold text-violet-700">{totalSignatures}</div></div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_170px_150px_150px]">
            <label className="relative sm:col-span-2 xl:col-span-1"><Search className="absolute left-3 top-3.5 text-slate-400" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-violet-600 focus:ring-4 focus:ring-violet-100" placeholder="Search course, code, or instructor" /></label>
            <select value={status} onChange={(event) => setStatus(event.target.value as AttendanceSessionStatus | "")} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">All statuses</option><option value="draft">Draft</option><option value="open">Open</option><option value="closed">Closed</option></select>
            <select value={month} onChange={(event) => setMonth(event.target.value)} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">All months</option>{Array.from({ length: 12 }, (_, index) => { const value = String(index + 1).padStart(2, "0"); const label = new Date(2026, index, 1).toLocaleDateString("en-SG", { month: "long" }); return <option key={value} value={value}>{label}</option>; })}</select>
            <select value={year} onChange={(event) => setYear(event.target.value)} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">All years</option>{years.map((item) => <option key={item}>{item}</option>)}</select>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="app-table-header bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Course</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Instructor</th><th className="px-4 py-3 text-center">Learners</th><th className="px-4 py-3 text-center">AM</th><th className="px-4 py-3 text-center">PM</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((record) => <tr key={record.id} className="hover:bg-slate-50/80"><td className="px-5 py-4"><div className="font-bold text-slate-900">{record.courseName}</div><div className="mt-0.5 text-xs text-slate-500">{record.courseCode || "No course code"}</div></td><td className="px-4 py-4 font-medium text-slate-700">{formatDate(record.courseDate)}</td><td className="px-4 py-4 text-slate-700">{record.instructorName}</td><td className="px-4 py-4 text-center font-bold text-slate-800">{record.uniqueLearnerCount}</td><td className="px-4 py-4 text-center font-semibold text-sky-700">{record.amCount}</td><td className="px-4 py-4 text-center font-semibold text-violet-700">{record.pmCount}</td><td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${statusStyle(record.status)}`}>{record.status}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-1.5"><button onClick={() => void openRecord(record)} className="app-icon-button flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200" title="View"><Eye size={16} /></button><button onClick={() => void downloadRecord(record)} disabled={working === `pdf-${record.id}`} className="app-icon-button flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200" title="Download PDF">{working === `pdf-${record.id}` ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}</button><button onClick={() => void removeRecord(record)} disabled={working === `delete-${record.id}`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50" title="Delete"><Trash2 size={16} /></button></div></td></tr>)}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 md:hidden">
            {visible.map((record) => <article key={record.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-bold text-slate-950">{record.courseName}</h2><p className="mt-1 text-xs text-slate-500">{record.courseCode || "No course code"} - {formatDate(record.courseDate)}</p></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-bold capitalize ${statusStyle(record.status)}`}>{record.status}</span></div><p className="mt-3 text-sm text-slate-600">{record.instructorName}</p><div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-lg bg-slate-50 p-2 text-center"><div className="text-lg font-bold">{record.uniqueLearnerCount}</div><div className="text-[10px] font-bold uppercase text-slate-500">Learners</div></div><div className="rounded-lg bg-sky-50 p-2 text-center"><div className="text-lg font-bold text-sky-700">{record.amCount}</div><div className="text-[10px] font-bold uppercase text-sky-700">AM</div></div><div className="rounded-lg bg-violet-50 p-2 text-center"><div className="text-lg font-bold text-violet-700">{record.pmCount}</div><div className="text-[10px] font-bold uppercase text-violet-700">PM</div></div></div><div className="mt-4 grid grid-cols-[1fr_44px_44px] gap-2"><button onClick={() => void openRecord(record)} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 text-sm font-bold text-white"><Eye size={16} /> View record</button><button onClick={() => void downloadRecord(record)} className="app-icon-button flex h-11 items-center justify-center rounded-lg border border-slate-200" aria-label="Download PDF"><Download size={17} /></button><button onClick={() => void removeRecord(record)} className="flex h-11 items-center justify-center rounded-lg border border-rose-200 text-rose-600" aria-label="Delete record"><Trash2 size={17} /></button></div></article>)}
          </div>

          {!visible.length ? <div className="px-5 py-16 text-center"><UsersRound className="mx-auto text-slate-300" size={34} /><p className="mt-3 font-semibold text-slate-700">No attendance records found</p><p className="mt-1 text-sm text-slate-500">Adjust the filters or create an attendance session.</p></div> : null}
          <footer className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm text-slate-500"><span>{filtered.length} record{filtered.length === 1 ? "" : "s"}</span><div className="flex items-center gap-2"><button disabled={currentPage <= 1} onClick={() => setPage((value) => value - 1)} className="app-icon-button flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40"><ChevronLeft size={17} /></button><span className="min-w-20 text-center text-xs font-bold uppercase">{currentPage} / {totalPages}</span><button disabled={currentPage >= totalPages} onClick={() => setPage((value) => value + 1)} className="app-icon-button flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40"><ChevronRight size={17} /></button></div></footer>
        </section>
      </div>

      {selected ? <Modal title={selected.courseName} subtitle={`${formatDate(selected.courseDate)} - ${selected.instructorName}`} onClose={() => setSelected(null)}>
        <div className="p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-4"><div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-bold uppercase text-slate-500">Learners</div><div className="mt-1 text-xl font-bold">{selected.uniqueLearnerCount}</div></div><div className="rounded-lg border border-sky-200 bg-sky-50 p-3"><div className="text-xs font-bold uppercase text-sky-700">AM signed</div><div className="mt-1 text-xl font-bold text-sky-800">{selected.amCount}</div></div><div className="rounded-lg border border-violet-200 bg-violet-50 p-3"><div className="text-xs font-bold uppercase text-violet-700">PM signed</div><div className="mt-1 text-xl font-bold text-violet-800">{selected.pmCount}</div></div><div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-bold uppercase text-slate-500">Status</div><div className="mt-1 text-sm font-bold capitalize">{selected.status}</div></div></div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end"><Link href="/attendance" className="app-button-secondary inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-bold">Manage session</Link><button onClick={() => void downloadRecord(selected, submissions)} disabled={detailLoading || working === `pdf-${selected.id}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 text-sm font-bold text-white"><Download size={16} /> Download PDF</button></div>
          {selected.trainerComments ? <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-bold uppercase text-slate-500">Trainer comments</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.trainerComments}</p></div> : null}
          {detailLoading ? <div className="flex min-h-52 items-center justify-center"><Loader2 className="animate-spin text-violet-700" /></div> : <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Learner</th><th className="px-4 py-3">Last 4</th><th className="px-4 py-3">Period</th><th className="px-4 py-3">Signature</th><th className="px-4 py-3">Submitted</th></tr></thead><tbody className="divide-y divide-slate-100">{submissions.map((entry) => <tr key={entry.id}><td className="px-4 py-3 font-semibold text-slate-900">{entry.learnerName}</td><td className="px-4 py-3 text-slate-600">{entry.lastFour}</td><td className="px-4 py-3"><span className="rounded-full bg-violet-50 px-2 py-1 text-xs font-bold uppercase text-violet-800">{entry.period}</span></td><td className="px-4 py-2"><div className="flex h-11 w-28 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white">{entry.signatureDataUrl ? <img src={entry.signatureDataUrl} alt={`${entry.learnerName} signature`} className="max-h-10 max-w-24 object-contain" /> : <span className="text-xs text-slate-400">Missing</span>}</div></td><td className="px-4 py-3 text-slate-500">{formatDateTime(entry.submittedAt)}</td></tr>)}</tbody></table>{!submissions.length ? <div className="p-12 text-center text-sm text-slate-500">No attendance entries were captured for this session.</div> : null}</div>}
        </div>
      </Modal> : null}
    </AppShell>
  );
}
