"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import { useRouter } from "next/navigation";
import {
  flightLogDraftKey,
  type FlightLogRecord
} from "@/lib/flight-log-storage";
import {
  fetchGoogleRecordById,
  fetchGoogleRecordsPage,
  type FlightLogRecordSummary
} from "@/lib/google-api";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FilePenLine,
  FileText,
  Search,
  X
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

const RECORDS_PER_PAGE = 10;

const monthOptions = [
  { value: "", label: "All months" },
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" }
];

function formatDate(value: string) {
  if (!value) return "-";

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-SG",
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  ).format(date);
}

export default function RecordsPage() {
  const router = useRouter();
  const { notify } =
    useAppMessage();

  const [
    records,
    setRecords
  ] = useState<
    FlightLogRecordSummary[]
  >([]);

  const [query, setQuery] =
    useState("");

  const [
    debouncedQuery,
    setDebouncedQuery
  ] = useState("");

  const [
    selectedMonth,
    setSelectedMonth
  ] = useState("");

  const [
    selectedYear,
    setSelectedYear
  ] = useState("");

  const [
    currentPage,
    setCurrentPage
  ] = useState(1);

  const [
    totalPages,
    setTotalPages
  ] = useState(1);

  const [
    totalRecords,
    setTotalRecords
  ] = useState(0);

  const [
    loadingRecords,
    setLoadingRecords
  ] = useState(true);

  const [
    loadingDetails,
    setLoadingDetails
  ] = useState(false);

  const [
    selectedRecord,
    setSelectedRecord
  ] = useState<FlightLogRecord | null>(
    null
  );

  const requestNumber =
    useRef(0);

  const yearOptions =
    useMemo(() => {
      const currentYear =
        new Date().getFullYear();

      return Array.from(
        { length: 15 },
        (_, index) =>
          currentYear - index
      );
    }, []);

  useEffect(() => {
    const timeout =
      window.setTimeout(() => {
        setDebouncedQuery(
          query.trim()
        );

        setCurrentPage(1);
      }, 400);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    selectedMonth,
    selectedYear
  ]);

  useEffect(() => {
    const currentRequest =
      requestNumber.current + 1;

    requestNumber.current =
      currentRequest;

    async function loadRecords() {
      setLoadingRecords(true);

      try {
        const result =
          await fetchGoogleRecordsPage({
            page: currentPage,
            pageSize:
              RECORDS_PER_PAGE,
            query: debouncedQuery,
            month: selectedMonth,
            year: selectedYear
          });

        if (
          currentRequest !==
          requestNumber.current
        ) {
          return;
        }

        setRecords(result.records);
        setCurrentPage(result.page);
        setTotalPages(
          result.totalPages
        );
        setTotalRecords(
          result.totalRecords
        );
      } catch (error) {
        if (
          currentRequest !==
          requestNumber.current
        ) {
          return;
        }

        setRecords([]);
        setTotalRecords(0);
        setTotalPages(1);

        notify({
          type: "error",
          title:
            "Unable to load records",
          message:
            error instanceof Error
              ? error.message
              : "Records could not be loaded from Google Sheets."
        });
      } finally {
        if (
          currentRequest ===
          requestNumber.current
        ) {
          setLoadingRecords(false);
        }
      }
    }

    loadRecords();
  }, [
    currentPage,
    debouncedQuery,
    selectedMonth,
    selectedYear,
    notify
  ]);

  async function loadFullRecord(
    summary: FlightLogRecordSummary
  ) {
    setLoadingDetails(true);

    try {
      return await fetchGoogleRecordById(
        summary.id
      );
    } catch (error) {
      notify({
        type: "error",
        title:
          "Unable to load record",
        message:
          error instanceof Error
            ? error.message
            : "The full student record could not be loaded."
      });

      return null;
    } finally {
      setLoadingDetails(false);
    }
  }

  async function viewRecord(
    summary: FlightLogRecordSummary
  ) {
    const fullRecord =
      await loadFullRecord(summary);

    if (fullRecord) {
      setSelectedRecord(fullRecord);
    }
  }

  async function continueRecord(
    summary: FlightLogRecordSummary
  ) {
    const record =
      await loadFullRecord(summary);

    if (!record) return;

    localStorage.setItem(
      flightLogDraftKey,
      JSON.stringify({
        recordId: record.id,
        createdAt:
          record.createdAt,
        student: record.student,
        rows: record.rows,
        updatedAt:
          new Date().toISOString()
      })
    );

    notify({
      type: "success",
      title: "Record loaded",
      message:
        `${record.student.studentName} is ready to continue in Flight Logs.`
    });

    router.push("/flight-logs");
  }

  function clearFilters() {
    setQuery("");
    setDebouncedQuery("");
    setSelectedMonth("");
    setSelectedYear("");
    setCurrentPage(1);
  }

  const filtersActive =
    Boolean(
      query ||
      selectedMonth ||
      selectedYear
    );

  return (
    <AppShell>
      {loadingRecords ? (
        <LoadingOverlay label="Loading record summaries..." />
      ) : null}

      {loadingDetails ? (
        <LoadingOverlay label="Loading complete student record..." />
      ) : null}

      <div className="app-page">
        <section className="app-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                <FileText className="h-3.5 w-3.5" />
                Saved Flight Logs
              </div>

              <h1 className="mt-3 text-2xl font-semibold text-slate-950">
                Records
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Search and continue student flight records without downloading the entire database.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <p className="font-semibold text-slate-950">
                {totalRecords} matching{" "}
                {totalRecords === 1
                  ? "record"
                  : "records"}
              </p>

              <p className="text-slate-500">
                Showing up to{" "}
                {RECORDS_PER_PAGE} per page
              </p>
            </div>
          </div>
        </section>

        <section className="app-card">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_160px_auto] lg:items-end">
            <label>
              <span className="text-sm font-medium text-slate-700">
                Search Records
              </span>

              <div className="mt-2 flex h-12 items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:border-brand-blue">
                <Search className="h-[17px] w-[17px] shrink-0 text-slate-400" />

                <input
                  value={query}
                  onChange={(event) =>
                    setQuery(
                      event.target.value
                    )
                  }
                  className="h-full min-w-0 flex-1 border-0 bg-transparent text-base outline-none md:text-sm"
                  placeholder="Student, company, or last 4"
                />
              </div>
            </label>

            <label>
              <span className="text-sm font-medium text-slate-700">
                Month
              </span>

              <select
                value={selectedMonth}
                onChange={(event) =>
                  setSelectedMonth(
                    event.target.value
                  )
                }
                className="app-input mt-2"
              >
                {monthOptions.map(
                  (month) => (
                    <option
                      key={month.value}
                      value={month.value}
                    >
                      {month.label}
                    </option>
                  )
                )}
              </select>
            </label>

            <label>
              <span className="text-sm font-medium text-slate-700">
                Year
              </span>

              <select
                value={selectedYear}
                onChange={(event) =>
                  setSelectedYear(
                    event.target.value
                  )
                }
                className="app-input mt-2"
              >
                <option value="">
                  All years
                </option>

                {yearOptions.map(
                  (year) => (
                    <option
                      key={year}
                      value={year}
                    >
                      {year}
                    </option>
                  )
                )}
              </select>
            </label>

            <button
              type="button"
              onClick={clearFilters}
              disabled={!filtersActive}
              className="app-button-secondary h-12 justify-center disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X className="h-4 w-4" />
              Clear
            </button>
          </div>
        </section>

        <section className="app-card overflow-hidden">
          <div className="divide-y divide-slate-200 lg:hidden">
            {records.map(
              (record) => (
                <article
                  key={record.id}
                  className="p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-slate-950">
                        {record.student
                          .studentName ||
                          "-"}
                      </p>

                      <p className="mt-1 truncate text-sm text-slate-500">
                        {record.student
                          .company ||
                          "-"}
                      </p>
                    </div>

                    <span className="shrink-0 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                      {
                        record.flightCount
                      }{" "}
                      {record.flightCount ===
                      1
                        ? "flight"
                        : "flights"}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                    <p>
                      <span className="font-semibold text-slate-800">
                        Last 4:
                      </span>{" "}
                      {record.student
                        .lastFourCharacters ||
                        "-"}
                    </p>

                    <p>
                      <span className="font-semibold text-slate-800">
                        Updated:
                      </span>{" "}
                      {formatDate(
                        record.updatedAt
                      )}
                    </p>
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <ActionButton
                      label="View record"
                      onClick={() =>
                        viewRecord(record)
                      }
                    >
                      <Eye className="h-4 w-4" />
                    </ActionButton>

                    <ActionButton
                      label="Continue record"
                      primary
                      onClick={() =>
                        continueRecord(
                          record
                        )
                      }
                    >
                      <FilePenLine className="h-4 w-4" />
                    </ActionButton>
                  </div>
                </article>
              )
            )}

            {!records.length &&
            !loadingRecords ? (
              <div className="p-10 text-center">
                <FileText className="mx-auto h-9 w-9 text-slate-300" />

                <p className="mt-3 text-sm font-semibold text-slate-700">
                  No records found.
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Try changing your search or date filters.
                </p>
              </div>
            ) : null}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <th className="px-4 py-3 font-semibold">
                    Student
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Company
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Last 4
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Flights
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Updated
                  </th>

                  <th className="px-4 py-3 text-right font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {records.map(
                  (record) => (
                    <tr
                      key={record.id}
                      className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                    >
                      <td className="px-4 py-4 font-semibold text-slate-950">
                        <span className="inline-flex items-center gap-2">
                          <FileText className="h-4 w-4 text-brand-navy" />

                          {record.student
                            .studentName ||
                            "-"}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-slate-700">
                        {record.student
                          .company ||
                          "-"}
                      </td>

                      <td className="px-4 py-4 text-slate-700">
                        {record.student
                          .lastFourCharacters ||
                          "-"}
                      </td>

                      <td className="px-4 py-4 text-slate-700">
                        {
                          record.flightCount
                        }
                      </td>

                      <td className="px-4 py-4 text-slate-700">
                        {formatDate(
                          record.updatedAt
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <ActionButton
                            label="View record"
                            onClick={() =>
                              viewRecord(
                                record
                              )
                            }
                          >
                            <Eye className="h-4 w-4" />
                          </ActionButton>

                          <ActionButton
                            label="Continue record"
                            primary
                            onClick={() =>
                              continueRecord(
                                record
                              )
                            }
                          >
                            <FilePenLine className="h-4 w-4" />
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  )
                )}

                {!records.length &&
                !loadingRecords ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      No saved records found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Page {currentPage} of{" "}
              {totalPages}
            </p>

            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                type="button"
                onClick={() =>
                  setCurrentPage(
                    (page) =>
                      Math.max(
                        1,
                        page - 1
                      )
                  )
                }
                disabled={
                  currentPage <= 1 ||
                  loadingRecords
                }
                className="app-button-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>

              <button
                type="button"
                onClick={() =>
                  setCurrentPage(
                    (page) =>
                      Math.min(
                        totalPages,
                        page + 1
                      )
                  )
                }
                disabled={
                  currentPage >=
                    totalPages ||
                  loadingRecords
                }
                className="app-button-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </div>

      {selectedRecord ? (
        <RecordDetailsModal
          record={selectedRecord}
          onClose={() =>
            setSelectedRecord(null)
          }
        />
      ) : null}
    </AppShell>
  );
}

function ActionButton({
  label,
  primary = false,
  onClick,
  children
}: {
  label: string;
  primary?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${
        primary
          ? "border-slate-950 bg-slate-950 text-white hover:bg-slate-800"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-950"
      }`}
    >
      {children}
    </button>
  );
}

function RecordDetailsModal({
  record,
  onClose
}: {
  record: FlightLogRecord;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/40 backdrop-blur-sm sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Close details"
      />

      <div className="relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-2xl sm:max-w-5xl sm:rounded-lg">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-950">
              {record.student
                .studentName ||
                "Student Record"}
            </h2>

            <p className="text-sm text-slate-500">
              Complete flight record details
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
            aria-label="Close record details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <section className="grid gap-4 sm:grid-cols-3">
            <Detail
              label="Company"
              value={
                record.student
                  .company || "-"
              }
            />

            <Detail
              label="Last 4"
              value={
                record.student
                  .lastFourCharacters ||
                "-"
              }
            />

            <Detail
              label="Signature"
              value={
                record.student
                  .studentSignatureDataUrl
                  ? "Captured"
                  : "Missing"
              }
            />
          </section>

          {record.student
            .studentSignatureDataUrl ? (
            <section className="rounded-lg border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-950">
                Student Signature
              </p>

              <img
                src={
                  record.student
                    .studentSignatureDataUrl
                }
                alt="Student signature"
                className="mt-3 h-24 max-w-full rounded-md border border-slate-200 bg-white object-contain"
              />
            </section>
          ) : null}

          <section className="overflow-hidden rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-semibold text-slate-950">
                Flight Entries (
                {record.rows.length})
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="px-4 py-3">
                      Date
                    </th>
                    <th className="px-4 py-3">
                      Location
                    </th>
                    <th className="px-4 py-3">
                      Start
                    </th>
                    <th className="px-4 py-3">
                      Duration
                    </th>
                    <th className="px-4 py-3">
                      UA
                    </th>
                    <th className="px-4 py-3">
                      Category
                    </th>
                    <th className="px-4 py-3">
                      Battery
                    </th>
                    <th className="px-4 py-3">
                      PIC
                    </th>
                    <th className="px-4 py-3">
                      AFE
                    </th>
                    <th className="px-4 py-3">
                      Remarks
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {record.rows.map(
                    (row, index) => (
                      <tr
                        key={`${record.id}-${index}`}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="px-4 py-3">
                          {row.date || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {row.location || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {row.startTime || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {row.duration || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {row.uaModel || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {row.uaCategory || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {row.batterySn || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {row.pilotInCommand || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {row.instructorInCommand || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {row.remarks || "-"}
                        </td>
                      </tr>
                    )
                  )}

                  {!record.rows.length ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        No flight entries found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-sm font-semibold text-slate-950">
        {value}
      </p>
    </div>
  );
}
