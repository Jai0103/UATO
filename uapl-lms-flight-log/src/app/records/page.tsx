"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import { flightLogDraftKey, type FlightLogRecord } from "@/lib/flight-log-storage";
import {
  deleteGoogleRecord,
  fetchGoogleRecordById,
  fetchGoogleRecordsPage,
  type FlightLogRecordSummary,
} from "@/lib/google-api";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  FilePenLine,
  FileText,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 10;

const monthOptions = [
  { value: "", label: "All months" },
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function formatDate(value: string) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function RecordsPage() {
  const router = useRouter();
  const { notify } = useAppMessage();
  const [records, setRecords] = useState<FlightLogRecordSummary[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<FlightLogRecord | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<FlightLogRecordSummary | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, index) => currentYear - index);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [query]);

  const loadRecords = useCallback(async () => {
    setLoading(true);

    try {
      const result = await fetchGoogleRecordsPage({
        page,
        pageSize: PAGE_SIZE,
        query: debouncedQuery,
        month: selectedMonth,
        year: selectedYear,
      });

      setRecords(result.records || []);
      setTotalPages(result.totalPages || 1);
      setTotalRecords(result.totalRecords || 0);

      if (result.page !== page) setPage(result.page);
    } catch (error) {
      setRecords([]);
      setTotalPages(1);
      setTotalRecords(0);
      notify({
        type: "error",
        title: "Records could not be loaded",
        message:
          error instanceof Error
            ? error.message
            : "Check the Apps Script deployment and try again.",
      });
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, notify, page, refreshKey, selectedMonth, selectedYear]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  async function loadRecordDetail(recordId: string) {
    setLoadingDetail(true);

    try {
      return await fetchGoogleRecordById(recordId);
    } catch (error) {
      notify({
        type: "error",
        title: "Record could not be opened",
        message: error instanceof Error ? error.message : "Please try again.",
      });
      return null;
    } finally {
      setLoadingDetail(false);
    }
  }

  async function viewRecord(recordId: string) {
    const detail = await loadRecordDetail(recordId);
    if (detail) setSelectedRecord(detail);
  }

  async function continueRecord(recordId: string) {
    const detail = await loadRecordDetail(recordId);
    if (!detail) return;

    localStorage.setItem(
      flightLogDraftKey,
      JSON.stringify({
        recordId: detail.id,
        createdAt: detail.createdAt,
        student: detail.student,
        rows: detail.rows,
        updatedAt: new Date().toISOString(),
      })
    );

    notify({
      type: "success",
      title: "Record loaded",
      message: `${detail.student.studentName} is ready to continue.`,
    });

    router.push("/flight-logs");
  }

  async function confirmDelete() {
    if (!recordToDelete) return;

    setDeleting(true);

    try {
      await deleteGoogleRecord(recordToDelete.id);

      if (selectedRecord?.id === recordToDelete.id) {
        setSelectedRecord(null);
      }

      notify({
        type: "success",
        title: "Flight record deleted",
        message: `${recordToDelete.student.studentName} was removed and recorded in Audit History.`,
      });

      const shouldReturnToPreviousPage = records.length === 1 && page > 1;
      setRecordToDelete(null);

      if (shouldReturnToPreviousPage) {
        setPage((current) => Math.max(1, current - 1));
      } else {
        setRefreshKey((current) => current + 1);
      }
    } catch (error) {
      notify({
        type: "error",
        title: "Delete failed",
        message:
          error instanceof Error
            ? error.message
            : "The record was not deleted. Please try again.",
      });
    } finally {
      setDeleting(false);
    }
  }

  function resetFilters() {
    setQuery("");
    setDebouncedQuery("");
    setSelectedMonth("");
    setSelectedYear("");
    setPage(1);
  }

  return (
    <AppShell>
      {loading ? <LoadingOverlay label="Loading saved records..." /> : null}
      {loadingDetail ? <LoadingOverlay label="Opening flight record..." /> : null}
      {deleting ? <LoadingOverlay label="Deleting flight record..." /> : null}

      <div className="app-page">
        <section className="app-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                <FileText size={14} />
                Saved Flight Logs
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-slate-950">Records</h1>
              <p className="mt-1 text-sm text-slate-500">
                {totalRecords.toLocaleString()} {totalRecords === 1 ? "record" : "records"}
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <CalendarDays size={17} className="text-brand-navy" />
              Page {page} of {totalPages}
            </div>
          </div>
        </section>

        <section className="app-card">
          <div className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_180px_160px_auto] lg:items-end">
            <label className="min-w-0">
              <span className="text-sm font-medium text-slate-700">Search records</span>
              <div className="mt-2 flex h-12 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 focus-within:border-brand-blue">
                <Search size={17} className="shrink-0 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-full min-w-0 flex-1 border-0 bg-transparent text-base outline-none md:text-sm"
                  placeholder="Student, company, or last 4"
                />
              </div>
            </label>

            <label>
              <span className="text-sm font-medium text-slate-700">Month</span>
              <select
                value={selectedMonth}
                onChange={(event) => {
                  setSelectedMonth(event.target.value);
                  setPage(1);
                }}
                className="app-input mt-2"
              >
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>{month.label}</option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-sm font-medium text-slate-700">Year</span>
              <select
                value={selectedYear}
                onChange={(event) => {
                  setSelectedYear(event.target.value);
                  setPage(1);
                }}
                className="app-input mt-2"
              >
                <option value="">All years</option>
                {yearOptions.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>

            <button type="button" onClick={resetFilters} className="app-button-secondary h-12 justify-center">
              <X size={16} />
              Clear
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-200 lg:hidden">
            {records.map((record) => (
              <article key={record.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-slate-950">
                      {record.student.studentName || "-"}
                    </p>
                    <p className="mt-1 truncate text-sm text-slate-500">
                      {record.student.company || "-"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                    {record.flightCount} {record.flightCount === 1 ? "flight" : "flights"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Last 4</p>
                    <p className="mt-1 font-medium text-slate-800">{record.student.lastFourCharacters || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Updated</p>
                    <p className="mt-1 font-medium text-slate-800">{formatDate(record.updatedAt)}</p>
                  </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <ActionButton label="View record" onClick={() => void viewRecord(record.id)}>
                    <Eye size={17} />
                  </ActionButton>
                  <ActionButton label="Continue record" primary onClick={() => void continueRecord(record.id)}>
                    <FilePenLine size={17} />
                  </ActionButton>
                  <ActionButton label="Delete record" danger onClick={() => setRecordToDelete(record)}>
                    <Trash2 size={17} />
                  </ActionButton>
                </div>
              </article>
            ))}

            {!records.length && !loading ? (
              <div className="px-5 py-14 text-center text-sm text-slate-500">No records found.</div>
            ) : null}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <th className="px-5 py-3 font-semibold">Student</th>
                  <th className="px-5 py-3 font-semibold">Company</th>
                  <th className="px-5 py-3 font-semibold">Last 4</th>
                  <th className="px-5 py-3 font-semibold">Flights</th>
                  <th className="px-5 py-3 font-semibold">Updated</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/70">
                    <td className="px-5 py-4 font-semibold text-slate-950">{record.student.studentName || "-"}</td>
                    <td className="px-5 py-4 text-slate-700">{record.student.company || "-"}</td>
                    <td className="px-5 py-4 text-slate-700">{record.student.lastFourCharacters || "-"}</td>
                    <td className="px-5 py-4 text-slate-700">{record.flightCount}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-700">{formatDate(record.updatedAt)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <ActionButton label="View record" onClick={() => void viewRecord(record.id)}><Eye size={16} /></ActionButton>
                        <ActionButton label="Continue record" primary onClick={() => void continueRecord(record.id)}><FilePenLine size={16} /></ActionButton>
                        <ActionButton label="Delete record" danger onClick={() => setRecordToDelete(record)}><Trash2 size={16} /></ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}

                {!records.length && !loading ? (
                  <tr><td colSpan={6} className="px-5 py-14 text-center text-slate-500">No records found.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Showing {records.length} of {totalRecords.toLocaleString()} records
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || loading}
                className="app-button-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages || loading}
                className="app-button-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </section>
      </div>

      {selectedRecord ? (
        <RecordDetailModal record={selectedRecord} onClose={() => setSelectedRecord(null)} onContinue={() => void continueRecord(selectedRecord.id)} />
      ) : null}

      {recordToDelete ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full rounded-t-xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-xl sm:p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <AlertTriangle size={22} />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-slate-950">Delete flight record?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              <span className="font-semibold text-slate-900">{recordToDelete.student.studentName}</span> and all associated flight entries will be permanently removed.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setRecordToDelete(null)} disabled={deleting} className="app-button-secondary justify-center">Cancel</button>
              <button type="button" onClick={() => void confirmDelete()} disabled={deleting} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                <Trash2 size={16} /> Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function ActionButton({
  label,
  children,
  onClick,
  primary = false,
  danger = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  const colors = danger
    ? "border-rose-200 text-rose-600 hover:bg-rose-50"
    : primary
      ? "border-brand-navy bg-brand-navy text-white hover:bg-slate-800"
      : "border-slate-200 text-slate-600 hover:bg-slate-100";

  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition-colors ${colors}`}>
      {children}
    </button>
  );
}

function RecordDetailModal({ record, onClose, onContinue }: { record: FlightLogRecord; onClose: () => void; onContinue: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-2xl sm:max-w-6xl sm:rounded-xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-950">{record.student.studentName || "Student record"}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{record.rows.length} {record.rows.length === 1 ? "flight" : "flights"}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <ActionButton label="Continue record" primary onClick={onContinue}><FilePenLine size={17} /></ActionButton>
            <ActionButton label="Close record" onClick={onClose}><X size={18} /></ActionButton>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailItem label="Company" value={record.student.company} />
            <DetailItem label="Last 4" value={record.student.lastFourCharacters} />
            <DetailItem label="Updated" value={formatDate(record.updatedAt)} />
          </div>

          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {['Date','Location','Start','Minutes','UA Model','Category','Battery','Pilot in Command','AFE / Instructor','Remarks'].map((label) => (
                    <th key={label} className="px-4 py-3 font-semibold">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {record.rows.map((row, index) => (
                  <tr key={`${record.id}-${index}`} className="border-t border-slate-100">
                    <td className="px-4 py-3">{row.date || "-"}</td><td className="px-4 py-3">{row.location || "-"}</td><td className="px-4 py-3">{row.startTime || "-"}</td><td className="px-4 py-3">{row.duration || "-"}</td><td className="px-4 py-3">{row.uaModel || "-"}</td><td className="px-4 py-3">{row.uaCategory || "-"}</td><td className="px-4 py-3">{row.batterySn || "-"}</td><td className="px-4 py-3">{row.pilotInCommand || "-"}</td><td className="px-4 py-3">{row.instructorInCommand || "-"}</td><td className="px-4 py-3">{row.remarks || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-900">{value || "-"}</p></div>;
}
