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
  Activity,
  BadgeCheck,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  History,
  Search,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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
  APPROVAL_CREATED: "Approval created",
  APPROVAL_UPDATED: "Approval updated",
  APPROVAL_ARCHIVED: "Approval archived",
  APPROVAL_DOCUMENT_UPLOADED: "Approval document uploaded",
  APPROVAL_DOCUMENT_DELETED: "Approval document deleted",
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
  if (
    action.includes("DELETED") ||
    action.includes("DEACTIVATED") ||
    action.includes("ARCHIVED")
  ) {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }
  if (
    action.includes("CREATED") ||
    action.includes("ACTIVATED") ||
    action.includes("UPLOADED")
  ) {
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

function actionAccent(action: string) {
  if (
    action.includes("DELETED") ||
    action.includes("DEACTIVATED") ||
    action.includes("ARCHIVED")
  ) {
    return "border-l-rose-500";
  }
  if (
    action.includes("CREATED") ||
    action.includes("ACTIVATED") ||
    action.includes("UPLOADED")
  ) {
    return "border-l-emerald-500";
  }
  if (action.includes("PASSWORD")) return "border-l-amber-500";
  if (action.includes("REPORT")) return "border-l-indigo-500";
  return "border-l-sky-500";
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

  const pageSummary = useMemo(
    () => ({
      changes: records.filter((record) => record.action.includes("UPDATED")).length,
      additions: records.filter((record) =>
        record.action.includes("CREATED") ||
        record.action.includes("ACTIVATED") ||
        record.action.includes("UPLOADED")
      ).length,
      attention: records.filter((record) =>
        record.action.includes("DELETED") ||
        record.action.includes("DEACTIVATED") ||
        record.action.includes("ARCHIVED")
      ).length,
    }),
    [records]
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

      const hasAuditValues =
        detailedRecord.previousValue !== null ||
        detailedRecord.updatedValue !== null ||
        detailedRecord.details !== null;

      if (!hasAuditValues) {
        throw new Error(
          "This AuditLog row has no saved detail values. Check columns K, L, and M in the AuditLog sheet."
        );
      }

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

      <div className="app-page mx-auto w-full max-w-[1600px]">
        <section className="app-card relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-1 bg-violet-600" />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                <ShieldCheck size={14} />
                Administrator Access
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-slate-950">
                Audit History
              </h1>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Trace user, operational, master-data, and report activity across {totalRecords.toLocaleString()} recorded {totalRecords === 1 ? "event" : "events"}.
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

        <section className="grid grid-cols-3 gap-3">
          <AuditMetric label="Updates" value={pageSummary.changes} icon={<Activity size={18} />} color="bg-sky-50 text-sky-700" />
          <AuditMetric label="Created" value={pageSummary.additions} icon={<BadgeCheck size={18} />} color="bg-emerald-50 text-emerald-700" />
          <AuditMetric label="Attention" value={pageSummary.attention} icon={<TriangleAlert size={18} />} color="bg-rose-50 text-rose-700" />
        </section>

        <section className="app-card border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Filter size={16} /> Filters
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_210px_180px_155px_155px_auto] xl:items-end">
            <label className="min-w-0">
              <span className="text-sm font-medium text-slate-700">Search</span>
              <div className="mt-2 flex h-12 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 shadow-sm transition focus-within:border-sky-600 focus-within:ring-2 focus-within:ring-sky-100">
                <Search size={17} className="shrink-0 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-full min-w-0 flex-1 border-0 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 md:text-sm"
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
              <article key={record.id} className={`border-l-4 p-4 ${actionAccent(record.action)}`}>
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
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{humanize(record.entityType)}</p>
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
                    <td className="px-5 py-4"><span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">{humanize(record.entityType)}</span></td>
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

function AuditMetric({ label, value, icon, color }: { label: string; value: number; icon: ReactNode; color: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="min-w-0"><p className="truncate text-xs font-medium text-slate-500 sm:text-sm">{label}</p><p className="mt-1 text-xl font-semibold text-slate-950 sm:text-2xl">{value}</p></div>
      <div className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:flex ${color}`}>{icon}</div>
    </div>
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
  const normalizedEntityType = record.entityType
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  const isFlightRecord =
    normalizedEntityType === "flightlog" ||
    record.action.trim().toUpperCase().startsWith("FLIGHT_");

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-lg border border-slate-200 bg-white shadow-2xl sm:max-w-5xl sm:rounded-lg">
        <div className="relative flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="absolute inset-y-0 left-0 w-1 bg-violet-600" />
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

          {isFlightRecord ? (
            <FlightAuditComparison
              previousValue={record.previousValue}
              updatedValue={record.updatedValue}
            />
          ) : (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <ReadableAuditPanel
                title="Previous value"
                value={record.previousValue}
                emptyLabel="No previous value"
              />
              <ReadableAuditPanel
                title="Updated value"
                value={record.updatedValue}
                emptyLabel="No updated value"
              />
            </div>
          )}

          <div className="mt-4">
            <ReadableAuditPanel
              title="Additional details"
              value={record.details}
              emptyLabel="No additional details"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-900">{value || "-"}</p></div>;
}

type FlightAuditRow = {
  id?: string;
  date?: string;
  location?: string;
  startTime?: string;
  duration?: string | number;
  uaModel?: string;
  uaCategory?: string;
  batterySn?: string;
  pilotInCommand?: string;
  instructorInCommand?: string;
  remarks?: string;
};

type FlightAuditValue = {
  student?: {
    studentName?: string;
    company?: string;
    lastFourCharacters?: string;
  };
  rows?: FlightAuditRow[];
  createdAt?: string;
  updatedAt?: string;
};

function asFlightAuditValue(value: AuditValue): FlightAuditValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as FlightAuditValue;
}

function flightRowKey(row: FlightAuditRow) {
  return row.id || [
    row.date,
    row.startTime,
    row.location,
    row.uaModel,
    row.batterySn,
  ].join("|");
}

function FlightAuditComparison({
  previousValue,
  updatedValue,
}: {
  previousValue: AuditValue;
  updatedValue: AuditValue;
}) {
  const previous = asFlightAuditValue(previousValue);
  const updated = asFlightAuditValue(updatedValue);
  const student = updated?.student || previous?.student;
  const previousRows = previous?.rows || [];
  const updatedRows = updated?.rows || [];
  const previousKeys = new Set(previousRows.map(flightRowKey));
  const updatedKeys = new Set(updatedRows.map(flightRowKey));

  return (
    <div className="mt-5 space-y-4">
      {student ? (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-950">
            Student record
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <DetailValue
              label="Student"
              value={student.studentName || "-"}
            />
            <DetailValue
              label="Company"
              value={student.company || "-"}
            />
            <DetailValue
              label="Last 4 characters"
              value={student.lastFourCharacters || "-"}
            />
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <FlightRowsPanel
          title="Before update"
          rows={previousRows}
          comparisonKeys={updatedKeys}
          emptyLabel="This was a newly created record."
          changeLabel="Removed"
          changeStyle="bg-rose-50 text-rose-700 ring-rose-200"
        />
        <FlightRowsPanel
          title="After update"
          rows={updatedRows}
          comparisonKeys={previousKeys}
          emptyLabel="No flight entries remain."
          changeLabel="Added"
          changeStyle="bg-emerald-50 text-emerald-700 ring-emerald-200"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DetailValue
          label="Previous flight count"
          value={String(previousRows.length)}
        />
        <DetailValue
          label="Updated flight count"
          value={String(updatedRows.length)}
        />
      </div>
    </div>
  );
}

function FlightRowsPanel({
  title,
  rows,
  comparisonKeys,
  emptyLabel,
  changeLabel,
  changeStyle,
}: {
  title: string;
  rows: FlightAuditRow[];
  comparisonKeys: Set<string>;
  emptyLabel: string;
  changeLabel: string;
  changeStyle: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
          <span className="text-xs font-medium text-slate-500">
            {rows.length} {rows.length === 1 ? "flight" : "flights"}
          </span>
        </div>
      </div>

      {rows.length ? (
        <div className="divide-y divide-slate-200">
          {rows.map((row, index) => {
            const changed = !comparisonKeys.has(flightRowKey(row));

            return (
              <article key={`${flightRowKey(row)}-${index}`} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      Flight {index + 1}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {cleanLegacyAuditDate(String(row.date || "-"))}
                      {" at "}
                      {cleanLegacyAuditTime(String(row.startTime || "-"))}
                    </p>
                  </div>
                  {changed ? (
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ring-inset ${changeStyle}`}
                    >
                      {changeLabel}
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                      Unchanged
                    </span>
                  )}
                </div>

                <div className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  <DetailValue label="Location" value={row.location || "-"} />
                  <DetailValue
                    label="Duration"
                    value={`${row.duration || "0"} minutes`}
                  />
                  <DetailValue label="UA model" value={row.uaModel || "-"} />
                  <DetailValue
                    label="UA category"
                    value={row.uaCategory || "-"}
                  />
                  <DetailValue
                    label="Battery S/N"
                    value={row.batterySn || "-"}
                  />
                  <DetailValue
                    label="Pilot in Command"
                    value={row.pilotInCommand || "-"}
                  />
                  <DetailValue
                    label="AFE / Instructor"
                    value={row.instructorInCommand || "-"}
                  />
                  <DetailValue label="Remarks" value={row.remarks || "-"} />
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="p-4 text-sm text-slate-500">{emptyLabel}</p>
      )}
    </section>
  );
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-900">
        {value || "-"}
      </p>
    </div>
  );
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

function readableAuditLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function readableAuditValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function flattenAuditValue(
  value: unknown,
  parentLabel = ""
): Array<{ label: string; value: string }> {
  if (value === null || value === undefined || value === "") return [];

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      flattenAuditValue(
        item,
        `${parentLabel || "Item"} ${index + 1}`
      )
    );
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, childValue]) => {
        const label = parentLabel
          ? `${parentLabel} - ${readableAuditLabel(key)}`
          : readableAuditLabel(key);

        return flattenAuditValue(childValue, label);
      }
    );
  }

  return [
    {
      label: parentLabel || "Value",
      value: readableAuditValue(value),
    },
  ];
}

function ReadableAuditPanel({ title, value, emptyLabel }: { title: string; value: AuditValue; emptyLabel: string }) {
  const hasValue = value !== null && value !== undefined && value !== "";
  const displayValue = cleanAuditDisplayValue(value);
  const entries = flattenAuditValue(displayValue);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h3 className="text-sm font-semibold text-slate-900">{title}</h3></div>
      {hasValue && entries.length ? (
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {entries.map((entry, index) => (
            <DetailValue
              key={`${entry.label}-${index}`}
              label={entry.label}
              value={entry.value}
            />
          ))}
        </div>
      ) : (
        <p className="p-4 text-sm text-slate-500">{emptyLabel}</p>
      )}
    </section>
  );
}
