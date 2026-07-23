"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Edit3,
  Eye,
  FilePlus2,
  Search,
  ShieldCheck,
  Trash2,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import {
  FATIGUE_RISK_QUESTIONS,
  FATIGUE_RISK_SECTIONS,
  type FatigueRiskRecord,
  type FatigueRiskRecordSummary
} from "@/lib/fatigue-risk";
import {
  deleteFatigueRiskRecord,
  fetchFatigueRiskRecord,
  fetchFatigueRiskRecordsPage,
  type FatigueRiskRecordsPage
} from "@/lib/fatigue-risk-api";
import {
  createFatigueRiskPdf,
  fatigueRiskPdfFileName
} from "@/lib/fatigue-risk-pdf";

const PAGE_SIZE = 10;

const emptyPage: FatigueRiskRecordsPage = {
  records: [],
  page: 1,
  pageSize: PAGE_SIZE,
  totalRecords: 0,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false
};

function formatDate(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function formatTimestamp(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function IconButton({
  label,
  icon: Icon,
  onClick,
  tone = "default"
}: {
  label: string;
  icon: typeof Eye;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-lg border bg-white outline-none transition focus-visible:ring-2 focus-visible:ring-sky-400 ${
        tone === "danger"
          ? "border-rose-200 text-rose-600 hover:bg-rose-50"
          : "border-slate-200 text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
      }`}
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export default function FatigueRiskRecordsPage() {
  const message = useAppMessage();
  const [recordsPage, setRecordsPage] =
    useState<FatigueRiskRecordsPage>(emptyPage);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [workingLabel, setWorkingLabel] = useState("");
  const [viewingRecord, setViewingRecord] =
    useState<FatigueRiskRecord | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchFatigueRiskRecordsPage({
        page,
        pageSize: PAGE_SIZE,
        query: debouncedQuery,
        year,
        month
      });
      setRecordsPage(result);
      if (page > result.totalPages) setPage(result.totalPages);
    } catch (error) {
      setRecordsPage(emptyPage);
      message.error(
        "Records could not be loaded",
        error instanceof Error
          ? error.message
          : "The fatigue-risk register is temporarily unavailable."
      );
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, month, page, year]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, index) => String(current - index));
  }, []);

  async function loadRecord(recordId: string) {
    setWorkingLabel("Loading checklist details...");
    try {
      return await fetchFatigueRiskRecord(recordId);
    } catch (error) {
      message.error(
        "Checklist could not be opened",
        error instanceof Error ? error.message : "Please try again."
      );
      return null;
    } finally {
      setWorkingLabel("");
    }
  }

  async function viewRecord(recordId: string) {
    const record = await loadRecord(recordId);
    if (record) setViewingRecord(record);
  }

  async function downloadRecord(recordId: string) {
    const record = await loadRecord(recordId);
    if (!record) return;

    setWorkingLabel("Preparing fatigue-risk report...");
    try {
      const doc = await createFatigueRiskPdf(record);
      doc.save(fatigueRiskPdfFileName(record));
    } catch (error) {
      message.error(
        "PDF generation failed",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorkingLabel("");
    }
  }

  async function removeRecord(record: FatigueRiskRecordSummary) {
    const confirmed = await message.confirm({
      title: "Delete this weekly checklist?",
      message: `${record.instructorName} - ${formatDate(record.assessmentDate)} will be permanently removed.`,
      confirmLabel: "Delete checklist",
      variant: "danger"
    });
    if (!confirmed) return;

    setWorkingLabel("Deleting fatigue-risk checklist...");
    try {
      await deleteFatigueRiskRecord(record.id);
      message.success(
        "Checklist deleted",
        "The weekly record was removed from the register."
      );
      if (viewingRecord?.id === record.id) setViewingRecord(null);
      await loadPage();
    } catch (error) {
      message.error(
        "Delete failed",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorkingLabel("");
    }
  }

  const firstRecord = recordsPage.totalRecords
    ? (recordsPage.page - 1) * recordsPage.pageSize + 1
    : 0;
  const lastRecord = Math.min(
    recordsPage.page * recordsPage.pageSize,
    recordsPage.totalRecords
  );

  return (
    <AppShell>
      {loading ? <LoadingOverlay label="Loading fatigue-risk records..." /> : null}
      {workingLabel ? <LoadingOverlay label={workingLabel} /> : null}

      <div className="app-page">
        <section className="app-page-header">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 ring-1 ring-indigo-100">
                <ClipboardCheck className="h-3.5 w-3.5" />
                Weekly compliance register
              </div>
              <h1 className="mt-3 text-2xl font-bold text-slate-950 sm:text-3xl">
                Fatigue Risk Records
              </h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Review and manage weekly checklists completed by the Head of
                Training.
              </p>
            </div>

            <Link
              href="/fatigue-risk"
              className="app-button-primary w-full sm:w-auto"
            >
              <FilePlus2 className="h-4 w-4" />
              Weekly checklist
            </Link>
          </div>
        </section>

        <section className="app-card">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_170px_170px]">
            <label className="relative block">
              <span className="sr-only">Search records</span>
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search trainer name or email"
                className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-base outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100 md:text-sm"
              />
            </label>
            <select
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setPage(1);
              }}
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-sky-600 md:text-sm"
              aria-label="Filter by month"
            >
              <option value="">All months</option>
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={String(index + 1).padStart(2, "0")}>
                  {new Intl.DateTimeFormat("en-SG", { month: "long" }).format(
                    new Date(2026, index, 1)
                  )}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(event) => {
                setYear(event.target.value);
                setPage(1);
              }}
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-sky-600 md:text-sm"
              aria-label="Filter by year"
            >
              <option value="">All years</option>
              {years.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[940px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-4">Week</th>
                  <th className="px-5 py-4">Instructor / AFE</th>
                  <th className="px-5 py-4">Completion</th>
                  <th className="px-5 py-4">Risks</th>
                  <th className="px-5 py-4">Review</th>
                  <th className="px-5 py-4">Updated</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recordsPage.records.map((record) => (
                  <tr key={record.id} className="transition hover:bg-slate-50">
                    <td className="px-5 py-4 font-semibold text-slate-900">
                      {formatDate(record.assessmentDate)}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">
                        {record.instructorName}
                      </p>
                      {record.instructorEmail ? (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {record.instructorEmail}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4">
                      {record.answeredCount}/{record.totalQuestions}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                          record.riskCount
                            ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
                            : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                        }`}
                      >
                        {record.riskCount ? (
                          <AlertTriangle className="h-3.5 w-3.5" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        {record.riskCount}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                          record.status === "reviewed"
                            ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100"
                            : "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
                        }`}
                      >
                        {record.status === "reviewed"
                          ? "Reviewed"
                          : "Awaiting review"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {formatTimestamp(record.updatedAt)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <IconButton
                          label="View checklist"
                          icon={Eye}
                          onClick={() => void viewRecord(record.id)}
                        />
                        <Link
                          href={`/fatigue-risk?id=${encodeURIComponent(record.id)}`}
                          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                          aria-label="Edit checklist"
                          title="Edit checklist"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Link>
                        <IconButton
                          label="Download PDF"
                          icon={Download}
                          onClick={() => void downloadRecord(record.id)}
                        />
                        <IconButton
                          label="Delete checklist"
                          icon={Trash2}
                          tone="danger"
                          onClick={() => void removeRecord(record)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 lg:hidden">
            {recordsPage.records.map((record) => (
              <article key={record.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-950">
                      {record.instructorName}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                      <CalendarDays className="h-4 w-4" />
                      {formatDate(record.assessmentDate)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                      record.status === "reviewed"
                        ? "bg-indigo-50 text-indigo-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {record.status === "reviewed" ? "Reviewed" : "Pending"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-lg font-bold text-slate-950">
                      {record.answeredCount}/{record.totalQuestions}
                    </p>
                    <p className="text-xs text-slate-500">Answered</p>
                  </div>
                  <div
                    className={`rounded-lg p-3 ${
                      record.riskCount ? "bg-rose-50" : "bg-emerald-50"
                    }`}
                  >
                    <p
                      className={`text-lg font-bold ${
                        record.riskCount ? "text-rose-700" : "text-emerald-700"
                      }`}
                    >
                      {record.riskCount}
                    </p>
                    <p className="text-xs text-slate-500">Risks identified</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2">
                  <IconButton
                    label="View checklist"
                    icon={Eye}
                    onClick={() => void viewRecord(record.id)}
                  />
                  <Link
                    href={`/fatigue-risk?id=${encodeURIComponent(record.id)}`}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600"
                    aria-label="Edit checklist"
                  >
                    <Edit3 className="h-4 w-4" />
                  </Link>
                  <IconButton
                    label="Download PDF"
                    icon={Download}
                    onClick={() => void downloadRecord(record.id)}
                  />
                  <IconButton
                    label="Delete checklist"
                    icon={Trash2}
                    tone="danger"
                    onClick={() => void removeRecord(record)}
                  />
                </div>
              </article>
            ))}
          </div>

          {!recordsPage.records.length && !loading ? (
            <div className="p-10 text-center">
              <ClipboardCheck className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 font-semibold text-slate-700">
                No fatigue-risk records found
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Adjust the filters or complete the weekly checklist.
              </p>
            </div>
          ) : null}

          <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Showing {firstRecord}-{lastRecord} of {recordsPage.totalRecords}
            </p>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={!recordsPage.hasPreviousPage}
                className="flex h-10 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <span className="px-2 text-sm font-semibold text-slate-600">
                {recordsPage.page} / {recordsPage.totalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPage((current) =>
                    Math.min(recordsPage.totalPages, current + 1)
                  )
                }
                disabled={!recordsPage.hasNextPage}
                className="flex h-10 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </footer>
        </section>
      </div>

      {viewingRecord ? (
        <RecordModal
          record={viewingRecord}
          onClose={() => setViewingRecord(null)}
          onDownload={() => void downloadRecord(viewingRecord.id)}
        />
      ) : null}
    </AppShell>
  );
}

function RecordModal({
  record,
  onClose,
  onDownload
}: {
  record: FatigueRiskRecord;
  onClose: () => void;
  onDownload: () => void;
}) {
  const responseMap = new Map(
    record.responses.map((response) => [
      response.questionId,
      response.response
    ])
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close record"
      />
      <div className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-lg border border-slate-200 bg-white shadow-2xl sm:max-w-5xl sm:rounded-lg">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-sky-700">
              ADA-UATO-2G
            </p>
            <h2 className="mt-1 truncate text-xl font-bold text-slate-950">
              {record.instructorName}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Week commencing {formatDate(record.assessmentDate)}
            </p>
          </div>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </header>

        <div className="overflow-y-auto p-4 sm:p-6">
          {FATIGUE_RISK_SECTIONS.map((section) => (
            <section key={section.id} className="mb-5">
              <h3 className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-800">
                {section.label}
              </h3>
              <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {FATIGUE_RISK_QUESTIONS.filter(
                  (question) => question.sectionId === section.id
                ).map((question) => {
                  const response = responseMap.get(question.id);
                  return (
                    <div
                      key={question.id}
                      className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_90px] sm:items-center"
                    >
                      <p className="text-sm leading-5 text-slate-700">
                        {question.question}
                      </p>
                      <span
                        className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${
                          response === "yes"
                            ? "bg-rose-50 text-rose-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {response === "yes" ? "Yes" : "No"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-700" />
              <h3 className="font-bold text-slate-950">
                Head of Training review
              </h3>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {record.recommendation || "Awaiting recommendation."}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">
                  Evaluated by
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {record.evaluatedBy || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">
                  Position
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {record.evaluatorPosition || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">
                  Signature
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {record.signatureDataUrl ? "Captured" : "Not captured"}
                </p>
              </div>
            </div>
          </section>
        </div>

        <footer className="grid grid-cols-2 gap-2 border-t border-slate-200 bg-slate-50 p-4">
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 text-sm font-semibold text-white"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </button>
        </footer>
      </div>
    </div>
  );
}
