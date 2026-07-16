"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import {
  fetchAuditHistoryDetail,
  fetchAuditHistoryPage,
  type AuditRecord,
  type AuditValue,
} from "@/lib/audit-api";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  History,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 10;

const actionLabels: Record<string, string> = {
  FLIGHT_CREATED: "Flight created",
  FLIGHT_UPDATED: "Flight updated",
  FLIGHT_DELETED: "Flight deleted",
  USER_CREATED: "User created",
  USER_UPDATED: "User updated",
  USER_ACTIVATED: "User activated",
  USER_DEACTIVATED: "User deactivated",
  USER_DELETED: "User deleted",
  PASSWORD_RESET: "Password reset",
  PASSWORD_CHANGED: "Password changed",
  MASTER_DATA_CREATED: "Master Data created",
  MASTER_DATA_UPDATED: "Master Data updated",
  MASTER_DATA_ACTIVATED: "Master Data activated",
  MASTER_DATA_DEACTIVATED: "Master Data deactivated",
  MASTER_DATA_DELETED: "Master Data deleted",
  REPORT_GENERATED: "Report generated",
};

function humanize(value: string) {
  if (actionLabels[value]) return actionLabels[value];

  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function actionStyle(action: string) {
  if (action.includes("DELETED") || action.includes("DEACTIVATED")) {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }
  if (action.includes("CREATED") || action.includes("ACTIVATED")) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }
  if (action.includes("PASSWORD")) {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }
  if (action.includes("REPORT")) {
    return "bg-indigo-50 text-indigo-700 ring-indigo-200";
  }
  return "bg-sky-50 text-sky-700 ring-sky-200";
}

export default function AuditHistoryPage() {
  const { notify } = useAppMessage();
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedAction, setSelectedAction] = useState("");
  const [selectedEntityType, setSelectedEntityType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [actionOptions, setActionOptions] = useState<string[]>([]);
  const [entityTypeOptions, setEntityTypeOptions] = useState<string[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<AuditRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [query]);

  const loadAuditHistory = useCallback(async () => {
    setLoading(true);

    try {
      const result = await fetchAuditHistoryPage({
        page,
        pageSize: PAGE_SIZE,
        query: debouncedQuery,
        auditAction: selectedAction,
        entityType: selectedEntityType,
        dateFrom,
        dateTo,
      });

      setRecords(result.records || []);
      setTotalPages(result.totalPages || 1);
      setTotalRecords(result.totalRecords || 0);
      setActionOptions(result.actionOptions || []);
      setEntityTypeOptions(result.entityTypeOptions || []);

      if (result.page !== page) setPage(result.page);
    } catch (error) {
      setRecords([]);
      notify({
        type: "error",
        title: "Audit History could not be loaded",
        message:
          error instanceof Error
            ? error.message
            : "Check the Apps Script deployment and try again.",
      });
    } finally {
      setLoading(false);
    }
  }, [
    dateFrom,
    dateTo,
    debouncedQuery,
    notify,
    page,
    selectedAction,
    selectedEntityType,
  ]);

  useEffect(() => {
    void loadAuditHistory();
  }, [loadAuditHistory]);

  const filtersActive = useMemo(
    () =>
      Boolean(
        query ||
          selectedAction ||
          selectedEntityType ||
          dateFrom ||
          dateTo
      ),
    [dateFrom, dateTo, query, selectedAction, selectedEntityType]
  );

  function clearFilters() {
    setQuery("");
    setDebouncedQuery("");
    setSelectedAction("");
    setSelectedEntityType("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  async function openAuditDetail(record: AuditRecord) {
    setLoadingDetail(true);

    try {
      const detailedRecord = await fetchAuditHistoryDetail(record.id);
      setSelectedRecord(detailedRecord);
    } catch (error) {
      notify({
        type: "error",
        title: "Audit details could not be loaded",
        message:
          error instanceof Error
            ? error.message
            : "Please try opening this activity again.",
      });
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <AppShell>
      {loading ? <LoadingOverlay label="Loading Audit History..." /> : null}
      {loadingDetail ? (
        <LoadingOverlay label="Loading activity details..." />
      ) : null}

      <div className="app-page">
        <section className="app-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                <ShieldCheck size={14} />
                Administrator Access
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-slate-950">
                Audit History
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {totalRecords.toLocaleString()} recorded {totalRecords === 1 ? "activity" : "activities"}
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <History size={18} className="text-brand-navy" />
              <div>
                <p className="text-xs text-slate-500">Current page</p>
                <p className="text-sm font-semibold text-slate-900">{page} of {totalPages}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="app-card">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Filter size={16} /> Filters
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_210px_180px_155px_155px_auto] xl:items-end">
            <label className="min-w-0">
              <span className="text-sm font-medium text-slate-700">Search</span>
              <div className="mt-2 flex h-12 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 focus-within:border-brand-blue">
                <Search size={17} className="shrink-0 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-full min-w-0 flex-1 border-0 bg-transparent text-base outline-none md:text-sm"
                  placeholder="Person, action, or record"
                />
              </div>
            </label>

            <FilterSelect
              label="Action"
              value={selectedAction}
              onChange={(value) => { setSelectedAction(value); setPage(1); }}
              options={actionOptions}
            />

            <FilterSelect
              label="Category"
              value={selectedEntityType}
              onChange={(value) => { setSelectedEntityType(value); setPage(1); }}
              options={entityTypeOptions}
            />

            <DateFilter label="From" value={dateFrom} onChange={(value) => { setDateFrom(value); setPage(1); }} />
            <DateFilter label="To" value={dateTo} onChange={(value) => { setDateTo(value); setPage(1); }} />

            <button
              type="button"
              onClick={clearFilters}
              disabled={!filtersActive}
              className="app-button-secondary h-12 justify-center disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X size={16} /> Clear
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-200 lg:hidden">
            {records.map((record) => (
              <article key={record.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${actionStyle(record.action)}`}>
                    {humanize(record.action)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void openAuditDetail(record)}
                    className="app-icon-button shrink-0"
                    aria-label="View audit details"
                    title="View details"
                  >
                    <Eye size={17} />
                  </button>
                </div>

                <p className="mt-3 truncate font-semibold text-slate-950">
                  {record.entityName || humanize(record.entityType)}
                </p>
                <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                  <p className="flex items-center gap-2"><UserRound size={15} /> {record.actorName || "System"}</p>
                  <p className="flex items-center gap-2"><CalendarRange size={15} /> {formatDate(record.timestamp)}</p>
                </div>
              </article>
            ))}

            {!records.length && !loading ? (
              <div className="px-5 py-14 text-center text-sm text-slate-500">No audit activities found.</div>
            ) : null}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <th className="px-5 py-3 font-semibold">Date and time</th>
                  <th className="px-5 py-3 font-semibold">User</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                  <th className="px-5 py-3 font-semibold">Category</th>
                  <th className="px-5 py-3 font-semibold">Record</th>
                  <th className="px-5 py-3 text-right font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-5 py-4 text-slate-700">{formatDate(record.timestamp)}</td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">{record.actorName || "System"}</p>
                      <p className="mt-0.5 max-w-[220px] truncate text-xs text-slate-500">{record.actorEmail || record.actorRole}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${actionStyle(record.action)}`}>
                        {humanize(record.action)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-700">{humanize(record.entityType)}</td>
                    <td className="px-5 py-4">
                      <p className="max-w-[240px] truncate font-medium text-slate-900">{record.entityName || "-"}</p>
                      <p className="mt-0.5 max-w-[240px] truncate text-xs text-slate-500">{record.entityId || "-"}</p>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => void openAuditDetail(record)}
                        className="app-icon-button"
                        aria-label="View audit details"
                        title="View details"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}

                {!records.length && !loading ? (
                  <tr><td colSpan={6} className="px-5 py-14 text-center text-slate-500">No audit activities found.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">Showing {records.length} of {totalRecords.toLocaleString()} activities</p>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} className="app-button-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50">
                <ChevronLeft size={16} /> Previous
              </button>
              <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading} className="app-button-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50">
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </section>
      </div>

      {selectedRecord ? (
        <AuditDetailModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />
      ) : null}
    </AppShell>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="app-input mt-2">
        <option value="">All {label.toLowerCase()}s</option>
        {options.map((option) => <option key={option} value={option}>{humanize(option)}</option>)}
      </select>
    </label>
  );
}

function DateFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="app-input mt-2" />
    </label>
  );
}

function AuditDetailModal({ record, onClose }: { record: AuditRecord; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-2xl sm:max-w-5xl sm:rounded-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${actionStyle(record.action)}`}>{humanize(record.action)}</span>
            <h2 className="mt-2 truncate text-lg font-semibold text-slate-950">{record.entityName || humanize(record.entityType)}</h2>
            <p className="mt-1 text-sm text-slate-500">{formatDate(record.timestamp)}</p>
          </div>
          <button type="button" onClick={onClose} className="app-icon-button shrink-0" aria-label="Close details"><X size={18} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem label="Performed by" value={record.actorName || "System"} />
            <InfoItem label="Email" value={record.actorEmail || "-"} />
            <InfoItem label="Role" value={humanize(record.actorRole)} />
            <InfoItem label="Category" value={humanize(record.entityType)} />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <JsonPanel title="Previous value" value={record.previousValue} emptyLabel="No previous value" />
            <JsonPanel title="Updated value" value={record.updatedValue} emptyLabel="No updated value" />
          </div>

          <div className="mt-4">
            <JsonPanel title="Additional details" value={record.details} emptyLabel="No additional details" />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-900">{value || "-"}</p></div>;
}

const auditMonthNumbers: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

function cleanLegacyAuditDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const match = value.match(
    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{4})\b/
  );

  if (!match) return value;

  return `${match[3]}-${auditMonthNumbers[match[1]] || "01"}-${match[2].padStart(2, "0")}`;
}

function cleanLegacyAuditTime(value: string) {
  if (/^\d{2}:\d{2}$/.test(value)) return value;

  const longDateTime = value.match(/\b(\d{1,2}):(\d{2}):\d{2}\s+GMT/);
  if (longDateTime) {
    return `${longDateTime[1].padStart(2, "0")}:${longDateTime[2]}`;
  }

  const simpleTime = value.match(/^(\d{1,2}):(\d{2})/);
  return simpleTime
    ? `${simpleTime[1].padStart(2, "0")}:${simpleTime[2]}`
    : value;
}

function cleanAuditDisplayValue(
  value: AuditValue,
  key = ""
): AuditValue {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    return value.map((item) =>
      cleanAuditDisplayValue(item as AuditValue)
    );
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        cleanAuditDisplayValue(childValue as AuditValue, childKey),
      ])
    );
  }

  if (typeof value !== "string") return value;
  if (key === "date") return cleanLegacyAuditDate(value);
  if (key === "startTime") return cleanLegacyAuditTime(value);

  return value;
}

function JsonPanel({ title, value, emptyLabel }: { title: string; value: AuditValue; emptyLabel: string }) {
  const hasValue = value !== null && value !== undefined && value !== "";
  const displayValue = cleanAuditDisplayValue(value);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h3 className="text-sm font-semibold text-slate-900">{title}</h3></div>
      {hasValue ? (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-6 text-slate-700">{typeof displayValue === "string" ? displayValue : JSON.stringify(displayValue, null, 2)}</pre>
      ) : (
        <p className="p-4 text-sm text-slate-500">{emptyLabel}</p>
      )}
    </section>
  );
}
