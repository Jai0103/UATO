"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import {
  getFlightLogRecords,
  type FlightLogRecord,
} from "@/lib/flight-log-storage";
import { fetchGoogleRecords, saveGeneratedReportPdf } from "@/lib/google-api";
import {
  createCombinedFlightLogPdf,
  createSingleFlightLogPdf,
  getPdfBase64,
  safePdfFileName,
} from "@/lib/pdf";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Link,
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
  return Number.isNaN(date.getTime()) ? null : date;
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

function combinedPdfFileName(records: FlightLogRecord[]) {
  const date = new Date().toISOString().slice(0, 10);

  if (records.length === 1) {
    return safePdfFileName(records[0].student.studentName);
  }

  return `UAPL LMS - COMBINED FLIGHT LOG - ${date}.pdf`;
}

export default function ReportsPage() {
  const { notify } = useAppMessage();

  const [records, setRecords] = useState<FlightLogRecord[]>([]);
  const [query, setQuery] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewTitle, setPreviewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingPdf, setSavingPdf] = useState(false);

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

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRecords.length / recordsPerPage)
  );

  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * recordsPerPage;
    return filteredRecords.slice(start, start + recordsPerPage);
  }, [currentPage, filteredRecords]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, selectedMonth, selectedYear]);

  const visiblePageIds = paginatedRecords.map((record) => record.id);

  const allVisibleSelected =
    visiblePageIds.length > 0 &&
    visiblePageIds.every((id) => selectedIds.includes(id));

  const selectedRecords = useMemo(() => {
    return records.filter((record) => selectedIds.includes(record.id));
  }, [records, selectedIds]);

  function toggleRecord(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function toggleCurrentPage() {
    setSelectedIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visiblePageIds.includes(id));
      }

      return Array.from(new Set([...current, ...visiblePageIds]));
    });
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function requireSelectedRecords() {
    if (!selectedRecords.length) {
      notify({
        type: "warning",
        title: "No records selected",
        message: "Tick at least one student flight log first.",
      });

      return false;
    }

    return true;
  }

  function createSelectedPdf() {
    if (selectedRecords.length === 1) {
      return createSingleFlightLogPdf({
        student: selectedRecords[0].student,
        rows: selectedRecords[0].rows,
      });
    }

    return createCombinedFlightLogPdf(selectedRecords);
  }

  function previewSelectedReports() {
    if (!requireSelectedRecords()) return;

    const doc = createSelectedPdf();
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(url);
    setPreviewTitle(combinedPdfFileName(selectedRecords));
  }

  function downloadSelectedReports() {
    if (!requireSelectedRecords()) return;

    const doc = createSelectedPdf();
    doc.save(combinedPdfFileName(selectedRecords));

    notify({
      type: "success",
      title: "PDF downloaded",
      message:
        selectedRecords.length === 1
          ? "The selected report was downloaded."
          : `${selectedRecords.length} records were combined into one PDF.`,
    });
  }

  async function saveSelectedReportsToDrive() {
    if (!requireSelectedRecords()) return;

    setSavingPdf(true);

    try {
      const doc = createSelectedPdf();
      const fileName = combinedPdfFileName(selectedRecords);
      const base64Pdf = getPdfBase64(doc);

      const result = await saveGeneratedReportPdf({
        fileName,
        base64Pdf,
        recordIds: selectedRecords.map((record) => record.id),
      });

      notify({
        type: "success",
        title: "PDF saved to Google Drive",
        message: result.reportUrl,
      });
    } catch {
      notify({
        type: "error",
        title: "PDF save failed",
        message:
          "The PDF could not be saved to Google Drive. Check Apps Script deployment.",
      });
    } finally {
      setSavingPdf(false);
    }
  }

  function closePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl("");
    setPreviewTitle("");
  }

  function goToPreviousPage() {
    setCurrentPage((page) => Math.max(1, page - 1));
  }

  function goToNextPage() {
    setCurrentPage((page) => Math.min(totalPages, page + 1));
  }

  return (
    <AppShell>
      {loading ? <LoadingOverlay label="Loading report records..." /> : null}
      {savingPdf ? <LoadingOverlay label="Saving PDF to Google Drive..." /> : null}

      <div className="app-page pb-24 md:pb-0">
        <section className="app-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                <FileText size={14} />
                PDF Reports
              </div>

              <h1 className="mt-3 text-2xl font-semibold text-slate-950">
                Reports
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Preview, download, combine, and save PDF reports to Google Drive.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <button
                onClick={clearSelection}
                className="app-button-secondary justify-center"
                disabled={!selectedIds.length}
              >
                Clear
              </button>

              <button
                onClick={previewSelectedReports}
                className="app-button-secondary justify-center"
              >
                <Eye size={17} />
                Preview
              </button>

              <button
                onClick={downloadSelectedReports}
                className="app-button-primary justify-center"
              >
                <Download size={17} />
                Download
              </button>

              <button
                onClick={saveSelectedReportsToDrive}
                className="app-button-primary justify-center"
              >
                <Link size={17} />
                Save Drive
              </button>
            </div>
          </div>
        </section>

        <section className="app-card">
          <div className="grid gap-4 lg:grid-cols-[1fr_180px_160px]">
            <label>
              <span className="text-sm font-medium text-slate-700">
                Search Reports
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
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-slate-950">
                {filteredRecords.length} matching records
              </p>
              <p className="text-sm text-slate-500">
                {selectedIds.length} selected. Showing max {recordsPerPage} per page.
              </p>
            </div>

            <button
              onClick={toggleCurrentPage}
              className="app-button-secondary justify-center"
              disabled={!paginatedRecords.length}
            >
              {allVisibleSelected ? "Untick Page" : "Tick Page"}
            </button>
          </div>

          <div className="block divide-y divide-slate-200 lg:hidden">
            {paginatedRecords.length ? (
              paginatedRecords.map((record) => (
                <article key={record.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(record.id)}
                      onChange={() => toggleRecord(record.id)}
                      className="mt-1 h-5 w-5"
                    />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-bold text-slate-950">
                        {record.student.studentName || "-"}
                      </p>
                      <p className="mt-1 truncate text-sm text-slate-500">
                        {record.student.company || "-"}
                      </p>

                      <div className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                        <p>
                          <span className="font-semibold text-slate-800">
                            Last 4:
                          </span>{" "}
                          {record.student.lastFourCharacters || "-"}
                        </p>
                        <p>
                          <span className="font-semibold text-slate-800">
                            Flights:
                          </span>{" "}
                          {record.rows.length}
                        </p>
                        <p>
                          <span className="font-semibold text-slate-800">
                            Signature:
                          </span>{" "}
                          {record.student.studentSignatureDataUrl
                            ? "Captured"
                            : "Missing"}
                        </p>
                        <p>
                          <span className="font-semibold text-slate-800">
                            Updated:
                          </span>{" "}
                          {formatDate(record.updatedAt)}
                        </p>
                      </div>
                    </div>
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
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <th className="w-[64px] px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleCurrentPage}
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">Last 4</th>
                  <th className="px-4 py-3 font-semibold">Flights</th>
                  <th className="px-4 py-3 font-semibold">Signature</th>
                  <th className="px-4 py-3 font-semibold">Updated</th>
                </tr>
              </thead>

              <tbody>
                {paginatedRecords.map((record) => (
                  <tr key={record.id} className="border-b border-slate-100">
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(record.id)}
                        onChange={() => toggleRecord(record.id)}
                      />
                    </td>

                    <td className="px-4 py-4 font-semibold text-slate-950">
                      {record.student.studentName || "-"}
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
                      {record.student.studentSignatureDataUrl
                        ? "Captured"
                        : "Missing"}
                    </td>

                    <td className="px-4 py-4 text-slate-700">
                      {formatDate(record.updatedAt)}
                    </td>
                  </tr>
                ))}

                {!paginatedRecords.length && !loading ? (
                  <tr>
                    <td
                      colSpan={7}
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
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className="app-button-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft size={16} />
                Previous
              </button>

              <button
                onClick={() =>
                  setCurrentPage((page) => Math.min(totalPages, page + 1))
                }
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

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur md:hidden">
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={previewSelectedReports}
            className="app-button-secondary justify-center"
          >
            <Eye size={16} />
            Preview
          </button>

          <button
            onClick={downloadSelectedReports}
            className="app-button-primary justify-center"
          >
            <Download size={16} />
            PDF
          </button>

          <button
            onClick={saveSelectedReportsToDrive}
            className="app-button-primary justify-center"
          >
            <Link size={16} />
            Drive
          </button>
        </div>
      </div>

      {previewUrl ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-6xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  PDF Preview
                </h2>
                <p className="text-sm text-slate-500">{previewTitle}</p>
              </div>

              <button
                onClick={closePreview}
                className="app-icon-button"
                aria-label="Close preview"
              >
                <X size={18} />
              </button>
            </div>

            <iframe
              src={previewUrl}
              title="PDF Preview"
              className="min-h-0 flex-1 bg-slate-100"
            />

            <div className="flex flex-col gap-2 border-t border-slate-200 p-4 sm:flex-row sm:justify-end">
              <button onClick={downloadSelectedReports} className="app-button-primary">
                <Download size={16} />
                Download PDF
              </button>

              <button
                onClick={saveSelectedReportsToDrive}
                className="app-button-primary"
              >
                <Link size={16} />
                Save to Drive
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
