"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import { useRouter } from "next/navigation";
import { flightLogDraftKey } from "@/lib/flight-log-storage";
import {
  getFlightLogRecords,
  type FlightLogRecord,
} from "@/lib/flight-log-storage";
import { fetchGoogleRecords } from "@/lib/google-api";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  FilePenLine,
  FileText,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const recordsPerPage = 10;

const monthOptions = [
  { value: "", label: "All months" },
  { value: "0", label: "January" },
  { value: "1", label: "February" },
  { value: "2", label: "March" },
  { value: "3", label: "April" },
  { value: "4", label: "May" },
  { value: "5", label: "June" },
  { value: "6", label: "July" },
  { value: "7", label: "August" },
  { value: "8", label: "September" },
  { value: "9", label: "October" },
  { value: "10", label: "November" },
  { value: "11", label: "December" },
];

function getRecordDate(record: FlightLogRecord) {
  const rawDate =
    record.updatedAt ||
    record.createdAt ||
    record.rows.find((row) => row.date)?.date ||
    "";

  if (!rawDate) return null;

  const date = new Date(rawDate);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatDate(value: string) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function RecordsPage() {
  const router = useRouter();
  const { notify } = useAppMessage();

  const [records, setRecords] = useState<FlightLogRecord[]>([]);
  const [query, setQuery] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<FlightLogRecord | null>(
    null
  );

  useEffect(() => {
    async function loadRecords() {
      setLoading(true);

      try {
        const googleRecords = await fetchGoogleRecords();
        setRecords(googleRecords);
      } catch {
        setRecords(getFlightLogRecords());
        notify({
          type: "warning",
          title: "Using local records",
          message: "Google Sheets records could not be loaded.",
        });
      } finally {
        setLoading(false);
      }
    }

    loadRecords();
  }, [notify]);

  function continueRecord(record: FlightLogRecord) {
    localStorage.setItem(
      flightLogDraftKey,
      JSON.stringify({
        recordId: record.id,
        createdAt: record.createdAt,
        student: record.student,
        rows: record.rows,
        updatedAt: new Date().toISOString(),
      })
    );

    notify({
      type: "success",
      title: "Record loaded",
      message: `${record.student.studentName} is ready to continue in Flight Logs.`,
    });

    router.push("/flight-logs");
  }

  const yearOptions = useMemo(() => {
    const years = records
      .map((record) => getRecordDate(record)?.getFullYear())
      .filter((year): year is number => Boolean(year));

    return Array.from(new Set(years)).sort((a, b) => b - a);
  }, [records]);

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return records.filter((record) => {
      const recordDate = getRecordDate(record);

      const queryMatches =
        !normalizedQuery ||
        [
          record.student.studentName,
          record.student.company,
          record.student.lastFourCharacters,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      const monthMatches =
        selectedMonth === "" ||
        (recordDate && recordDate.getMonth() === Number(selectedMonth));

      const yearMatches =
        selectedYear === "" ||
        (recordDate && recordDate.getFullYear() === Number(selectedYear));

      return queryMatches && monthMatches && yearMatches;
    });
  }, [query, records, selectedMonth, selectedYear]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / recordsPerPage));

  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * recordsPerPage;
    return filteredRecords.slice(start, start + recordsPerPage);
  }, [currentPage, filteredRecords]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, selectedMonth, selectedYear]);

  function goToPreviousPage() {
    setCurrentPage((page) => Math.max(1, page - 1));
  }

  function goToNextPage() {
    setCurrentPage((page) => Math.min(totalPages, page + 1));
  }

  return (
    <AppShell>
      {loading ? <LoadingOverlay label="Loading saved records..." /> : null}

      <div className="app-page">
        <section className="app-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                <FileText size={14} />
                Saved Flight Logs
              </div>

              <h1 className="mt-3 text-2xl font-semibold text-slate-950">
                Records
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                View, filter, and continue saved student flight log records.
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <p className="font-semibold text-slate-950">
                {filteredRecords.length} matching records
              </p>
              <p className="text-slate-500">
                Showing max {recordsPerPage} per page
              </p>
            </div>
          </div>
        </section>

        <section className="app-card">
          <div className="grid gap-4 lg:grid-cols-[1fr_180px_160px]">
            <label>
              <span className="text-sm font-medium text-slate-700">
                Search Records
              </span>
              <div className="mt-2 flex h-12 items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:border-brand-blue">
                <Search size={17} className="text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
                  placeholder="Search student, company, or last 4"
                />
              </div>
            </label>

            <label>
              <span className="text-sm font-medium text-slate-700">Month</span>
              <select
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="app-input mt-2"
              >
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-sm font-medium text-slate-700">Year</span>
              <select
                value={selectedYear}
                onChange={(event) => setSelectedYear(event.target.value)}
                className="app-input mt-2"
              >
                <option value="">All years</option>
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="app-card overflow-hidden">
          <div className="block divide-y divide-slate-200 lg:hidden">
            {paginatedRecords.length ? (
              paginatedRecords.map((record) => (
                <article key={record.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-slate-950">
                        {record.student.studentName || "-"}
                      </p>
                      <p className="mt-1 truncate text-sm text-slate-500">
                        {record.student.company || "-"}
                      </p>
                    </div>

                    <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                      {record.rows.length} flights
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                    <p>
                      <span className="font-semibold text-slate-800">Last 4:</span>{" "}
                      {record.student.lastFourCharacters || "-"}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-800">Updated:</span>{" "}
                      {formatDate(record.updatedAt)}
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSelectedRecord(record)}
                      className="app-button-secondary justify-center"
                    >
                      <Eye size={16} />
                      View
                    </button>

                    <button
                      onClick={() => continueRecord(record)}
                      className="app-button-primary justify-center"
                    >
                      <FilePenLine size={16} />
                      Continue
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="p-8 text-center text-slate-500">
                No saved records found.
              </div>
            )}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">Last 4</th>
                  <th className="px-4 py-3 font-semibold">Flights</th>
                  <th className="px-4 py-3 font-semibold">Updated</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>

              <tbody>
                {paginatedRecords.map((record) => (
                  <tr key={record.id} className="border-b border-slate-100">
                    <td className="px-4 py-4 font-semibold text-slate-950">
                      <span className="inline-flex items-center gap-2">
                        <FileText size={16} className="text-brand-navy" />
                        {record.student.studentName || "-"}
                      </span>
                    </td>

                    <td className="px-4 py-4 text-slate-700">
                      {record.student.company || "-"}
                    </td>

                    <td className="px-4 py-4 text-slate-700">
                      {record.student.lastFourCharacters || "-"}
                    </td>

                    <td className="px-4 py-4 text-slate-700">
                      {record.rows.length}
                    </td>

                    <td className="px-4 py-4 text-slate-700">
                      {formatDate(record.updatedAt)}
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedRecord(record)}
                          className="app-icon-button"
                          aria-label="View record"
                          title="View record"
                        >
                          <Eye size={16} />
                        </button>

                        <button
                          onClick={() => continueRecord(record)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-brand-navy text-white hover:bg-slate-800"
                          aria-label="Continue record"
                          title="Continue record"
                        >
                          <FilePenLine size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!paginatedRecords.length && !loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-slate-500"
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
              Page {currentPage} of {totalPages}
            </p>

            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                onClick={goToPreviousPage}
                disabled={currentPage === 1}
                className="app-button-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft size={16} />
                Previous
              </button>

              <button
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                className="app-button-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </section>
      </div>

      {selectedRecord ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-2xl sm:max-w-5xl sm:rounded-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  {selectedRecord.student.studentName || "Student Record"}
                </h2>
                <p className="text-sm text-slate-500">
                  Saved flight log record details.
                </p>
              </div>

              <button
                onClick={() => setSelectedRecord(null)}
                className="app-icon-button"
                aria-label="Close record details"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <section className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-md bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    Company
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">
                    {selectedRecord.student.company || "-"}
                  </p>
                </div>

                <div className="rounded-md bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    Last 4
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">
                    {selectedRecord.student.lastFourCharacters || "-"}
                  </p>
                </div>

                <div className="rounded-md bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    Signature
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">
                    {selectedRecord.student.studentSignatureDataUrl
                      ? "Captured"
                      : "Missing"}
                  </p>
                </div>
              </section>

              {selectedRecord.student.studentSignatureDataUrl ? (
                <section className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-950">
                    Student Signature
                  </p>
                  <img
                    src={selectedRecord.student.studentSignatureDataUrl}
                    alt="Student signature"
                    className="mt-3 h-24 max-w-full rounded-md border border-slate-200 bg-white object-contain"
                  />
                </section>
              ) : null}

              <section className="rounded-lg border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-950">
                    Flight Entries
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Location</th>
                        <th className="px-4 py-3">Start</th>
                        <th className="px-4 py-3">Duration</th>
                        <th className="px-4 py-3">UA</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Battery</th>
                        <th className="px-4 py-3">PIC</th>
                        <th className="px-4 py-3">AFE</th>
                      </tr>
                    </thead>

                    <tbody>
                      {selectedRecord.rows.map((row, index) => (
                        <tr key={index} className="border-b border-slate-100">
                          <td className="px-4 py-3">{row.date || "-"}</td>
                          <td className="px-4 py-3">{row.location || "-"}</td>
                          <td className="px-4 py-3">{row.startTime || "-"}</td>
                          <td className="px-4 py-3">{row.duration || "-"}</td>
                          <td className="px-4 py-3">{row.uaModel || "-"}</td>
                          <td className="px-4 py-3">{row.uaCategory || "-"}</td>
                          <td className="px-4 py-3">{row.batterySn || "-"}</td>
                          <td className="px-4 py-3">
                            {row.pilotInCommand || "-"}
                          </td>
                          <td className="px-4 py-3">
                            {row.instructorInCommand || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
