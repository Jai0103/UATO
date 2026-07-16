"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import type {
  FlightLogRecord
} from "@/lib/flight-log-storage";
import {
  fetchGoogleRecordsByIds,
  fetchGoogleRecordsPage,
  saveGeneratedReportPdf,
  type FlightLogRecordSummary
} from "@/lib/google-api";
import {
  createCombinedFlightLogPdf,
  createSingleFlightLogPdf,
  getPdfBase64,
  safePdfFileName
} from "@/lib/pdf";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Link,
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
const MAX_SELECTED_RECORDS = 25;

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

function reportFileName(
  records: FlightLogRecord[]
) {
  const date =
    new Date()
      .toISOString()
      .slice(0, 10);

  if (records.length === 1) {
    const studentName =
      safePdfFileName(
        records[0].student
          .studentName ||
          "Student"
      );

    return `${studentName} - FLIGHT LOG - ${date}.pdf`;
  }

  return `STUDENTS - COMBINED FLIGHT LOG - ${date}.pdf`;
}

function createReportDocument(
  records: FlightLogRecord[]
) {
  if (records.length === 1) {
    return createSingleFlightLogPdf(
      records[0]
    );
  }

  return createCombinedFlightLogPdf(
    records
  );
}

export default function ReportsPage() {
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
    selectedIds,
    setSelectedIds
  ] = useState<string[]>([]);

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
    previewUrl,
    setPreviewUrl
  ] = useState("");

  const [
    previewTitle,
    setPreviewTitle
  ] = useState("");

  const [
    previewRecords,
    setPreviewRecords
  ] = useState<
    FlightLogRecord[]
  >([]);

  const [
    loadingRecords,
    setLoadingRecords
  ] = useState(true);

  const [
    preparingPdf,
    setPreparingPdf
  ] = useState(false);

  const [
    savingPdf,
    setSavingPdf
  ] = useState(false);

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

    async function loadPage() {
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
            "Unable to load reports",
          message:
            error instanceof Error
              ? error.message
              : "Report records could not be loaded."
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

    loadPage();
  }, [
    currentPage,
    debouncedQuery,
    selectedMonth,
    selectedYear,
    notify
  ]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(
          previewUrl
        );
      }
    };
  }, [previewUrl]);

  const visiblePageIds =
    records.map(
      (record) => record.id
    );

  const allVisibleSelected =
    visiblePageIds.length > 0 &&
    visiblePageIds.every((id) =>
      selectedIds.includes(id)
    );

  function toggleRecord(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) {
        return current.filter(
          (item) => item !== id
        );
      }

      if (
        current.length >=
        MAX_SELECTED_RECORDS
      ) {
        notify({
          type: "warning",
          title:
            "Selection limit reached",
          message:
            `A maximum of ${MAX_SELECTED_RECORDS} records can be combined at one time.`
        });

        return current;
      }

      return [...current, id];
    });
  }

  function toggleCurrentPage() {
    setSelectedIds((current) => {
      if (allVisibleSelected) {
        return current.filter(
          (id) =>
            !visiblePageIds.includes(
              id
            )
        );
      }

      const availableSlots =
        MAX_SELECTED_RECORDS -
        current.length;

      const newIds =
        visiblePageIds.filter(
          (id) =>
            !current.includes(id)
        );

      if (
        newIds.length >
        availableSlots
      ) {
        notify({
          type: "warning",
          title:
            "Selection limit reached",
          message:
            `Only ${availableSlots} more record${
              availableSlots === 1
                ? ""
                : "s"
            } can be selected.`
        });
      }

      return Array.from(
        new Set([
          ...current,
          ...newIds.slice(
            0,
            availableSlots
          )
        ])
      );
    });
  }

  function clearSelection() {
    setSelectedIds([]);
    setPreviewRecords([]);
    closePreview();
  }

  function clearFilters() {
    setQuery("");
    setDebouncedQuery("");
    setSelectedMonth("");
    setSelectedYear("");
    setCurrentPage(1);
  }

  async function loadSelectedRecords() {
    if (!selectedIds.length) {
      notify({
        type: "warning",
        title:
          "No records selected",
        message:
          "Tick at least one student flight log first."
      });

      return null;
    }

    setPreparingPdf(true);

    try {
      const fullRecords =
        await fetchGoogleRecordsByIds(
          selectedIds
        );

      if (!fullRecords.length) {
        notify({
          type: "error",
          title:
            "No records loaded",
          message:
            "The selected student records could not be loaded."
        });

        return null;
      }

      if (
        fullRecords.length !==
        selectedIds.length
      ) {
        notify({
          type: "warning",
          title:
            "Some records were unavailable",
          message:
            `${fullRecords.length} of ${selectedIds.length} selected records were loaded.`
        });
      }

      return fullRecords;
    } catch (error) {
      notify({
        type: "error",
        title:
          "Unable to prepare reports",
        message:
          error instanceof Error
            ? error.message
            : "Selected records could not be loaded."
      });

      return null;
    } finally {
      setPreparingPdf(false);
    }
  }

  async function previewSelectedReports() {
    const fullRecords =
      await loadSelectedRecords();

    if (!fullRecords) return;

    const document =
      createReportDocument(
        fullRecords
      );

    const blob =
      document.output("blob");

    const url =
      URL.createObjectURL(blob);

    if (previewUrl) {
      URL.revokeObjectURL(
        previewUrl
      );
    }

    setPreviewRecords(
      fullRecords
    );

    setPreviewUrl(url);

    setPreviewTitle(
      reportFileName(fullRecords)
    );
  }

  async function downloadSelectedReports(
    suppliedRecords?: FlightLogRecord[]
  ) {
    const fullRecords =
      suppliedRecords &&
      suppliedRecords.length
        ? suppliedRecords
        : await loadSelectedRecords();

    if (!fullRecords) return;

    const document =
      createReportDocument(
        fullRecords
      );

    document.save(
      reportFileName(fullRecords)
    );

    notify({
      type: "success",
      title: "PDF downloaded",
      message:
        fullRecords.length === 1
          ? "The selected report was downloaded."
          : `${fullRecords.length} student records were combined into one PDF.`
    });
  }

  async function saveSelectedReportsToDrive(
    suppliedRecords?: FlightLogRecord[]
  ) {
    let fullRecords =
      suppliedRecords &&
      suppliedRecords.length
        ? suppliedRecords
        : null;

    if (!fullRecords) {
      fullRecords =
        await loadSelectedRecords();
    }

    if (!fullRecords) return;

    setSavingPdf(true);

    try {
      const document =
        createReportDocument(
          fullRecords
        );

      const fileName =
        reportFileName(
          fullRecords
        );

      const base64Pdf =
        getPdfBase64(document);

      const result =
        await saveGeneratedReportPdf({
          fileName,
          base64Pdf,
          recordIds:
            fullRecords.map(
              (record) =>
                record.id
            )
        });

      notify({
        type: "success",
        title:
          "PDF saved to Google Drive",
        message:
          result.reportUrl
      });
    } catch (error) {
      notify({
        type: "error",
        title:
          "PDF save failed",
        message:
          error instanceof Error
            ? error.message
            : "The PDF could not be saved to Google Drive."
      });
    } finally {
      setSavingPdf(false);
    }
  }

  function closePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(
        previewUrl
      );
    }

    setPreviewUrl("");
    setPreviewTitle("");
    setPreviewRecords([]);
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
        <LoadingOverlay label="Loading report summaries..." />
      ) : null}

      {preparingPdf ? (
        <LoadingOverlay label={`Loading ${selectedIds.length} complete record${
          selectedIds.length === 1
            ? ""
            : "s"
        }...`} />
      ) : null}

      {savingPdf ? (
        <LoadingOverlay label="Saving PDF to Google Drive..." />
      ) : null}

      <div className="app-page pb-24 md:pb-0">
        <section className="app-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                <FileText className="h-3.5 w-3.5" />
                PDF Reports
              </div>

              <h1 className="mt-3 text-2xl font-semibold text-slate-950">
                Reports
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Select students across pages, then preview, download, or save a combined PDF.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={clearSelection}
                className="app-button-secondary justify-center"
                disabled={
                  !selectedIds.length
                }
              >
                Clear
              </button>

              <button
                type="button"
                onClick={
                  previewSelectedReports
                }
                className="app-button-secondary justify-center"
                disabled={
                  !selectedIds.length
                }
              >
                <Eye className="h-4 w-4" />
                Preview
              </button>

              <button
                type="button"
                onClick={() =>
                  downloadSelectedReports()
                }
                className="app-button-primary justify-center"
                disabled={
                  !selectedIds.length
                }
              >
                <Download className="h-4 w-4" />
                Download
              </button>

              <button
                type="button"
                onClick={() =>
                  saveSelectedReportsToDrive()
                }
                className="app-button-primary justify-center"
                disabled={
                  !selectedIds.length
                }
              >
                <Link className="h-4 w-4" />
                Save Drive
              </button>
            </div>
          </div>
        </section>

        <section className="app-card">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_160px_auto] lg:items-end">
            <label>
              <span className="text-sm font-medium text-slate-700">
                Search Reports
              </span>

              <div className="mt-2 flex h-12 items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:border-brand-blue">
                <Search className="h-[17px] w-[17px] text-slate-400" />

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
              className="app-button-secondary h-12 justify-center disabled:opacity-40"
            >
              <X className="h-4 w-4" />
              Clear
            </button>
          </div>
        </section>

        <section className="app-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-slate-950">
                {totalRecords} matching{" "}
                {totalRecords === 1
                  ? "record"
                  : "records"}
              </p>

              <p className="text-sm text-slate-500">
                {selectedIds.length} of{" "}
                {MAX_SELECTED_RECORDS} selected
              </p>
            </div>

            <button
              type="button"
              onClick={toggleCurrentPage}
              className="app-button-secondary justify-center"
              disabled={!records.length}
            >
              {allVisibleSelected
                ? "Untick Page"
                : "Tick Page"}
            </button>
          </div>

          <div className="divide-y divide-slate-200 lg:hidden">
            {records.map(
              (record) => (
                <label
                  key={record.id}
                  className="flex cursor-pointer items-start gap-3 p-4"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(
                      record.id
                    )}
                    onChange={() =>
                      toggleRecord(
                        record.id
                      )
                    }
                    className="mt-1 h-5 w-5 shrink-0"
                  />

                  <div className="min-w-0 flex-1">
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

                    <div className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                      <p>
                        <strong className="text-slate-800">
                          Last 4:
                        </strong>{" "}
                        {record.student
                          .lastFourCharacters ||
                          "-"}
                      </p>

                      <p>
                        <strong className="text-slate-800">
                          Flights:
                        </strong>{" "}
                        {
                          record.flightCount
                        }
                      </p>

                      <p>
                        <strong className="text-slate-800">
                          Updated:
                        </strong>{" "}
                        {formatDate(
                          record.updatedAt
                        )}
                      </p>
                    </div>
                  </div>
                </label>
              )
            )}

            {!records.length &&
            !loadingRecords ? (
              <div className="p-10 text-center text-slate-500">
                No saved records found.
              </div>
            ) : null}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <th className="w-[64px] px-4 py-3">
                    <input
                      type="checkbox"
                      checked={
                        allVisibleSelected
                      }
                      onChange={
                        toggleCurrentPage
                      }
                    />
                  </th>

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
                </tr>
              </thead>

              <tbody>
                {records.map(
                  (record) => (
                    <tr
                      key={record.id}
                      className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                    >
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(
                            record.id
                          )}
                          onChange={() =>
                            toggleRecord(
                              record.id
                            )
                          }
                        />
                      </td>

                      <td className="px-4 py-4 font-semibold text-slate-950">
                        {record.student
                          .studentName ||
                          "-"}
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
                className="app-button-secondary justify-center disabled:opacity-50"
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
                className="app-button-secondary justify-center disabled:opacity-50"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur md:hidden">
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={
              previewSelectedReports
            }
            disabled={
              !selectedIds.length
            }
            className="app-button-secondary justify-center disabled:opacity-50"
          >
            <Eye className="h-4 w-4" />
            Preview
          </button>

          <button
            type="button"
            onClick={() =>
              downloadSelectedReports()
            }
            disabled={
              !selectedIds.length
            }
            className="app-button-primary justify-center disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            PDF
          </button>

          <button
            type="button"
            onClick={() =>
              saveSelectedReportsToDrive()
            }
            disabled={
              !selectedIds.length
            }
            className="app-button-primary justify-center disabled:opacity-50"
          >
            <Link className="h-4 w-4" />
            Drive
          </button>
        </div>
      </div>

      {previewUrl ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex h-[92vh] w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-2xl sm:max-w-6xl sm:rounded-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-950">
                  PDF Preview
                </h2>

                <p className="truncate text-sm text-slate-500">
                  {previewTitle}
                </p>
              </div>

              <button
                type="button"
                onClick={closePreview}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <iframe
              src={previewUrl}
              title="PDF Preview"
              className="min-h-0 flex-1 bg-slate-100"
            />

            <div className="flex flex-col gap-2 border-t border-slate-200 p-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() =>
                  downloadSelectedReports(
                    previewRecords
                  )
                }
                className="app-button-primary justify-center"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </button>

              <button
                type="button"
                onClick={() =>
                  saveSelectedReportsToDrive(
                    previewRecords
                  )
                }
                className="app-button-primary justify-center"
              >
                <Link className="h-4 w-4" />
                Save to Drive
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
