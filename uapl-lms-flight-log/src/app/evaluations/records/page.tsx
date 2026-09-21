"use client";

import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  MessageSquareText,
  QrCode,
  Search,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import {
  fetchAllFirebaseEvaluationResponses,
  fetchFirebaseEvaluationSessionsPage
} from "@/lib/evaluation-firebase-api";
import {
  downloadDynamicEvaluationCsv,
  downloadDynamicEvaluationPdf
} from "@/lib/evaluation-dynamic-report";
import {
  evaluationRatingFields,
  type EvaluationResponse,
  type EvaluationResponseSummary,
  type EvaluationSession,
  type EvaluationSessionsPage
} from "@/lib/evaluations";

const PAGE_SIZE = 10;
const emptyPage: EvaluationSessionsPage = {
  sessions: [], page: 1, pageSize: PAGE_SIZE, totalRecords: 0,
  totalPages: 1, hasPreviousPage: false, hasNextPage: false
};

function formatDate(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-SG", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short" }).format(date)
    : "-";
}

function overallAverage(summary: EvaluationResponseSummary) {
  const values = evaluationRatingFields.map((field) => summary.averages[field]).filter((value) => value > 0);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

export default function EvaluationRecordsPage() {
  const message = useAppMessage();
  const [records, setRecords] = useState<EvaluationSessionsPage>(emptyPage);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [year, setYear] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [viewing, setViewing] = useState<{ session: EvaluationSession; responses: EvaluationResponse[]; summary: EvaluationResponseSummary } | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedQuery(query.trim()); setPage(1); }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadPage = useCallback(async () => {
    const requestId = ++sequence.current;
    setLoading(true);
    try {
      const result = await fetchFirebaseEvaluationSessionsPage({ page, pageSize: PAGE_SIZE, query: debouncedQuery, year, status: status as "" | "draft" | "open" | "closed" });
      if (requestId !== sequence.current) return;
      setRecords(result);
      if (page > result.totalPages) setPage(result.totalPages);
    } catch (error) {
      if (requestId !== sequence.current) return;
      setRecords(emptyPage);
      message.error("Evaluation records could not be loaded", error instanceof Error ? error.message : "Please try again.");
    } finally {
      if (requestId === sequence.current) setLoading(false);
    }
  }, [debouncedQuery, message, page, status, year]);

  useEffect(() => { void loadPage(); }, [loadPage]);
  useEffect(() => () => { sequence.current += 1; }, []);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, index) => String(current - index));
  }, []);

  async function loadResponses(session: EvaluationSession) {
    setWorking("Loading evaluation responses...");
    try {
      const result = await fetchAllFirebaseEvaluationResponses(session.id);
      return { session, ...result };
    } catch (error) {
      message.error("Responses could not be loaded", error instanceof Error ? error.message : "Please try again.");
      return null;
    } finally { setWorking(""); }
  }

  async function openRecord(session: EvaluationSession) {
    const complete = await loadResponses(session);
    if (complete) setViewing(complete);
  }

  async function download(session: EvaluationSession, format: "pdf" | "csv") {
    const complete = await loadResponses(session);
    if (!complete) return;
    setWorking(format === "pdf" ? "Preparing evaluation PDF..." : "Preparing evaluation CSV...");
    try {
      if (format === "pdf") await downloadDynamicEvaluationPdf(session, complete);
      else downloadDynamicEvaluationCsv(session, complete);
      message.success("Report downloaded", `${session.courseName} was downloaded as ${format.toUpperCase()}.`);
    } catch (error) {
      message.error("Report could not be generated", error instanceof Error ? error.message : "Please try again.");
    } finally { setWorking(""); }
  }

  const first = records.totalRecords ? (records.page - 1) * records.pageSize + 1 : 0;
  const last = Math.min(records.page * records.pageSize, records.totalRecords);

  return <AppShell>
    {loading ? <LoadingOverlay label="Loading evaluation records..." /> : null}
    {working ? <LoadingOverlay label={working} /> : null}
    <div className="app-page">
      <section className="app-page-header"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="inline-flex items-center gap-2 rounded-md bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700 ring-1 ring-violet-100"><MessageSquareText className="h-3.5 w-3.5" /> Training feedback register</div><h1 className="mt-3 text-2xl font-bold text-slate-950 sm:text-3xl">Evaluation Records</h1><p className="mt-1 text-sm leading-6 text-slate-600">Review course sessions, response totals, ratings, and learner comments.</p></div><Link href="/evaluations" className="app-button-primary w-full sm:w-auto"><QrCode className="h-4 w-4" /> Manage QR sessions</Link></div></section>
      <section className="app-card"><div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_170px_170px]"><label className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search course, trainer, or location" className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100" /></label><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">All statuses</option><option value="draft">Draft</option><option value="open">Open</option><option value="closed">Closed</option></select><select value={year} onChange={(event) => { setYear(event.target.value); setPage(1); }} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">All years</option>{years.map((item) => <option key={item}>{item}</option>)}</select></div></section>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500"><tr><th className="px-5 py-4">Course / Date</th><th className="px-5 py-4">Trainer</th><th className="px-5 py-4">Location</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Responses</th><th className="px-5 py-4">Updated</th><th className="px-5 py-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{records.sessions.map((session) => <tr key={session.id} className="hover:bg-slate-50"><td className="px-5 py-4"><p className="font-semibold text-slate-950">{session.courseName}</p><p className="mt-1 text-xs text-slate-500">{formatDate(session.trainingDate)}</p></td><td className="px-5 py-4 text-slate-700">{session.trainerName}</td><td className="px-5 py-4 text-slate-600">{session.location || "-"}</td><td className="px-5 py-4"><Status value={session.status} /></td><td className="px-5 py-4"><span className="inline-flex min-w-9 justify-center rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">{session.responseCount}</span></td><td className="px-5 py-4 text-slate-500">{formatTimestamp(session.updatedAt)}</td><td className="px-5 py-4"><div className="flex justify-end gap-2"><IconButton label="View evaluation" icon={Eye} onClick={() => void openRecord(session)} /><IconButton label="Download PDF" icon={Download} onClick={() => void download(session, "pdf")} /><IconButton label="Download CSV" icon={FileSpreadsheet} onClick={() => void download(session, "csv")} /></div></td></tr>)}</tbody></table></div>
        <div className="divide-y divide-slate-100 lg:hidden">{records.sessions.map((session) => <article key={session.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-bold text-slate-950">{session.courseName}</p><p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><CalendarDays className="h-4 w-4" />{formatDate(session.trainingDate)}</p></div><Status value={session.status} /></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-lg bg-slate-50 p-3"><p className="font-semibold text-slate-900">{session.trainerName}</p><p className="text-xs text-slate-500">Trainer</p></div><div className="rounded-lg bg-violet-50 p-3"><p className="text-lg font-bold text-violet-700">{session.responseCount}</p><p className="text-xs text-slate-500">Responses</p></div></div><div className="mt-4 flex gap-2"><IconButton label="View evaluation" icon={Eye} onClick={() => void openRecord(session)} /><IconButton label="Download PDF" icon={Download} onClick={() => void download(session, "pdf")} /><IconButton label="Download CSV" icon={FileSpreadsheet} onClick={() => void download(session, "csv")} /></div></article>)}</div>
        {!records.sessions.length && !loading ? <div className="p-10 text-center"><MessageSquareText className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-semibold text-slate-700">No evaluation sessions found</p><p className="mt-1 text-sm text-slate-500">Adjust the filters or create a course evaluation session.</p></div> : null}
        <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-500">Showing {first}-{last} of {records.totalRecords}</p><div className="flex items-center justify-between gap-2"><button type="button" disabled={!records.hasPreviousPage} onClick={() => setPage((value) => Math.max(1, value - 1))} className="flex h-10 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button><span className="px-2 text-sm font-semibold text-slate-600">{records.page} / {records.totalPages}</span><button type="button" disabled={!records.hasNextPage} onClick={() => setPage((value) => Math.min(records.totalPages, value + 1))} className="flex h-10 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button></div></footer>
      </section>
    </div>
    {viewing ? <RecordModal data={viewing} onClose={() => setViewing(null)} onPdf={() => void download(viewing.session, "pdf")} onCsv={() => void download(viewing.session, "csv")} /> : null}
  </AppShell>;
}

function Status({ value }: { value: EvaluationSession["status"] }) {
  const tone = value === "open" ? "bg-emerald-50 text-emerald-700" : value === "closed" ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-700";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${tone}`}>{value}</span>;
}

function IconButton({ label, icon: Icon, onClick }: { label: string; icon: typeof Eye; onClick: () => void }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"><Icon className="h-4 w-4" /></button>;
}

function RecordModal({ data, onClose, onPdf, onCsv }: { data: { session: EvaluationSession; responses: EvaluationResponse[]; summary: EvaluationResponseSummary }; onClose: () => void; onPdf: () => void; onCsv: () => void }) {
  const average = overallAverage(data.summary);
  return <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-5"><button type="button" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" /><div className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-lg bg-white shadow-2xl sm:max-w-5xl sm:rounded-lg"><header className="flex items-start justify-between border-b border-slate-200 p-5"><div><p className="text-xs font-bold uppercase text-violet-700">Evaluation summary</p><h2 className="mt-1 text-xl font-bold text-slate-950">{data.session.courseName}</h2><p className="mt-1 text-sm text-slate-500">{formatDate(data.session.trainingDate)} · {data.session.trainerName}</p></div><IconButton label="Close" icon={X} onClick={onClose} /></header><div className="overflow-y-auto p-5"><div className="grid gap-3 sm:grid-cols-3"><Metric label="Responses" value={String(data.summary.responseCount)} /><Metric label="Overall average" value={average ? `${average.toFixed(2)} / 5` : "-"} /><Metric label="Would recommend" value={data.summary.responseCount ? `${data.summary.recommendPercentage.toFixed(0)}%` : "-"} /></div><section className="mt-5"><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-violet-700" /><h3 className="font-bold text-slate-950">Question averages</h3></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{evaluationRatingFields.map((field) => <div key={field} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5"><span className="text-sm capitalize text-slate-600">{field.replace(/([A-Z])/g, " $1")}</span><span className="font-bold text-slate-950">{data.summary.averages[field]?.toFixed(2) || "-"}</span></div>)}</div></section><section className="mt-5"><h3 className="font-bold text-slate-950">Learner responses</h3><div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">{data.responses.map((response, index) => <div key={response.id} className="p-4"><div className="flex items-center justify-between gap-3"><p className="font-semibold text-slate-900">{response.studentName || `Anonymous response ${index + 1}`}</p><p className="text-xs text-slate-500">{formatTimestamp(response.submittedAt)}</p></div>{response.additionalComments || response.improvements ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{response.additionalComments || response.improvements}</p> : null}</div>)}{!data.responses.length ? <p className="p-5 text-sm text-slate-500">No responses have been submitted.</p> : null}</div></section></div><footer className="grid grid-cols-3 gap-2 border-t border-slate-200 bg-slate-50 p-4"><button type="button" onClick={onClose} className="h-12 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700">Close</button><button type="button" onClick={onCsv} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700"><FileSpreadsheet className="h-4 w-4" />CSV</button><button type="button" onClick={onPdf} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-sky-700 text-sm font-semibold text-white"><Download className="h-4 w-4" />PDF</button></footer></div></div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><p className="text-2xl font-bold text-slate-950">{value}</p><p className="mt-1 text-xs font-semibold uppercase text-slate-500">{label}</p></div>; }
