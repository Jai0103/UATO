"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import {
  getFlightLogRecords,
  type FlightLogRecord
} from "@/lib/flight-log-storage";
import { fetchGoogleRecords } from "@/lib/google-api";
import { generateFlightLogPdf } from "@/lib/pdf";
import {
  CheckSquare,
  Download,
  FileText,
  Search,
  Square,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export default function ReportsPage() {
  const { notify } = useAppMessage();

  const [records, setRecords] = useState<FlightLogRecord[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

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
          message: "Google Sheets records could not be loaded."
        });
      } finally {
        setLoading(false);
      }
    }

    loadRecords();
  }, [notify]);

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return records;

    return records.filter((record) =>
      [
        record.student.studentName,
        record.student.company,
        record.student.lastFourCharacters
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [query, records]);

  const selectedRecords = useMemo(
    () => records.filter((record) => selectedIds.includes(record.id)),
    [records, selectedIds]
  );

  const allFilteredSelected =
    filteredRecords.length > 0 &&
    filteredRecords.every((record) => selectedIds.includes(record.id));

  function toggleRecord(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function toggleAllFiltered() {
    const filteredIds = filteredRecords.map((record) => record.id);

    if (allFilteredSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !filteredIds.includes(id))
      );
      return;
    }

    setSelectedIds((current) => Array.from(new Set([...current, ...filteredIds])));
  }

  function clearSelected() {
    setSelectedIds([]);
  }

  function generateSelectedReports() {
    if (!selectedRecords.length) {
      notify({
        type: "warning",
        title: "No records selected",
        message: "Select at least one student flight log before generating reports."
      });
      return;
    }

    selectedRecords.forEach((record) => {
      generateFlightLogPdf({
        student: record.student,
        rows: record.rows
      });
    });

    notify({
      type: "success",
      title: "Reports generated",
      message: `${selectedRecords.length} PDF report(s) were downloaded.`
    });
  }

  return (
    <AppShell>
      {loading ? <LoadingOverlay label="Loading report records..." /> : null}

      <div className="app-page pb-24 md:pb-0">
        <section className="app-card">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h1 className="app-title">Reports</h1>
              <p className="app-subtitle">
                Select one or multiple student flight logs and generate PDF reports.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2 text-center">
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-lg font-semibold text-slate-950">
                  {records.length}
                </p>
                <p className="text-[11px] font-medium uppercase text-slate-500">
                  Records
                </p>
              </div>

              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-lg font-semibold text-slate-950">
                  {filteredRecords.length}
                </p>
                <p className="text-[11px] font-medium uppercase text-slate-500">
                  Shown
                </p>
              </div>

              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-lg font-semibold text-slate-950">
                  {selectedIds.length}
                </p>
                <p className="text-[11px] font-medium uppercase text-slate-500">
                  Selected
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={generateSelectedReports}
              className="app-button-primary"
            >
              <Download size={17} />
              Generate Selected
            </button>

            <button
              onClick={toggleAllFiltered}
              className="app-button-secondary"
            >
              {allFilteredSelected ? <CheckSquare size={17} /> : <Square size={17} />}
              {allFilteredSelected ? "Unselect Filtered" : "Select Filtered"}
            </button>

            {selectedIds.length ? (
              <button
                onClick={clearSelected}
                className="app-button-secondary"
              >
                <XCircle size={17} />
                Clear Selection
              </button>
            ) : null}
          </div>
        </section>

        <section className="app-card">
          <label>
            <span className="text-sm font-medium text-slate-700">
              Search Reports
            </span>
            <div className="mt-2 flex h-12 items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:border-brand-blue md:h-11">
              <Search size={17} className="text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-base outline-none md:text-sm"
                placeholder="Search student, company, or last 4 characters"
              />
            </div>
          </label>
        </section>

        <section className="lg:hidden">
          {filteredRecords.length ? (
            <div className="space-y-3">
              {filteredRecords.map((record) => {
                const selected = selectedIds.includes(record.id);

                return (
                  <button
                    key={record.id}
                    onClick={() => toggleRecord(record.id)}
                    className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm transition ${
                      selected
                        ? "border-brand-navy ring-2 ring-brand-navy/10"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-950">
                          {record.student.studentName || "-"}
                        </p>
                        <p className="mt-1 truncate text-sm text-slate-500">
                          {record.student.company || "No company"} - Last 4:{" "}
                          {record.student.lastFourCharacters || "-"}
                        </p>
                      </div>

                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                          selected
                            ? "bg-brand-navy text-white"
                            : "border border-slate-200 text-slate-500"
                        }`}
                      >
                        {selected ? <CheckSquare size={17} /> : <Square size={17} />}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-slate-50 px-2 py-2">
                        <p className="text-sm font-semibold text-slate-950">
                          {record.rows.length}
                        </p>
                        <p className="text-[11px] uppercase text-slate-500">
                          Flights
                        </p>
                      </div>

                      <div className="rounded-lg bg-slate-50 px-2 py-2">
                        <p className="text-sm font-semibold text-slate-950">
                          {record.student.studentSignatureDataUrl
                            ? "Captured"
                            : "Missing"}
                        </p>
                        <p className="text-[11px] uppercase text-slate-500">
                          Signature
                        </p>
                      </div>

                      <div className="rounded-lg bg-slate-50 px-2 py-2">
                        <p className="truncate text-xs font-semibold text-slate-950">
                          {record.updatedAt
                            ? new Date(record.updatedAt).toLocaleDateString()
                            : "-"}
                        </p>
                        <p className="text-[11px] uppercase text-slate-500">
                          Updated
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : !loading ? (
            <div className="app-card text-center text-sm text-slate-500">
              No saved records found.
            </div>
          ) : null}
        </section>

        <section className="hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <th className="w-[64px] px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleAllFiltered}
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
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="border-b border-slate-100">
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(record.id)}
                        onChange={() => toggleRecord(record.id)}
                      />
                    </td>

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
                      {record.student.studentSignatureDataUrl ? "Captured" : "Missing"}
                    </td>

                    <td className="px-4 py-4 text-slate-700">
                      {record.updatedAt
                        ? new Date(record.updatedAt).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))}

                {!filteredRecords.length && !loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No saved records found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur md:hidden">
        <button
          onClick={generateSelectedReports}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-navy text-xs font-semibold text-white"
        >
          <Download size={15} />
          Generate {selectedIds.length ? `(${selectedIds.length})` : "Selected"}
        </button>
      </div>
    </AppShell>
  );
}
