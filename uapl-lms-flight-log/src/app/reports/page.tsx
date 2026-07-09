"use client";

import { AppShell } from "@/components/app-shell";
import {
  getFlightLogRecords,
  type FlightLogRecord
} from "@/lib/flight-log-storage";
import { generateFlightLogPdf } from "@/lib/pdf";
import { Download, FileText, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export default function ReportsPage() {
  const [records, setRecords] = useState<FlightLogRecord[]>([]);
  const [query, setQuery] = useState("");
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    const savedRecords = getFlightLogRecords();
    setRecords(savedRecords);

    if (savedRecords[0]) {
      setSelectedRecordId(savedRecords[0].id);
    }
  }, []);

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return records;
    }

    return records.filter((record) => {
      const searchableText = [
        record.student.studentName,
        record.student.company,
        record.student.lastFourCharacters
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [query, records]);

  const selectedRecord =
    filteredRecords.find((record) => record.id === selectedRecordId) ??
    filteredRecords[0];

  function generateSelectedReport() {
    if (!selectedRecord) {
      setStatusMessage("No student record selected.");
      return;
    }

    generateFlightLogPdf({
      student: selectedRecord.student,
      rows: selectedRecord.rows
    });

    setStatusMessage(
      `${selectedRecord.student.studentName} flight log PDF generated.`
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl min-w-0 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Reports</h1>
          <p className="mt-1 text-sm text-slate-500">
            Search saved flight log records and generate student PDF reports.
          </p>
        </div>

        {statusMessage ? (
          <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm">
            {statusMessage}
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <label>
              <span className="text-sm font-medium text-slate-700">
                Search Student Record
              </span>

              <div className="mt-2 flex h-11 items-center gap-2 rounded-md border border-slate-300 px-3 focus-within:border-brand-blue">
                <Search size={17} className="text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSelectedRecordId("");
                  }}
                  className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
                  placeholder="Search name, company, or last 4 characters"
                />
              </div>
            </label>

            <button
              onClick={generateSelectedReport}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand-navy px-4 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Download size={17} />
              Generate PDF
            </button>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase text-slate-500">
              Saved Records
            </h2>

            <div className="space-y-2">
              {filteredRecords.length ? (
                filteredRecords.map((record) => {
                  const selected = selectedRecord?.id === record.id;

                  return (
                    <button
                      key={record.id}
                      onClick={() => setSelectedRecordId(record.id)}
                      className={`w-full rounded-lg border p-4 text-left transition ${
                        selected
                          ? "border-brand-navy bg-slate-50"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-navy text-white">
                          <FileText size={18} />
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">
                            {record.student.studentName || "Unnamed Student"}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {record.student.company || "No company"} · Last 4:{" "}
                            {record.student.lastFourCharacters || "-"}
                          </p>
                          <p className="mt-2 text-xs text-slate-400">
                            {record.rows.length} flight entries
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                  No records found. Save a flight log record first.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Report Preview</h2>

            {selectedRecord ? (
              <div className="mt-5 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-md bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Student Name
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">
                      {selectedRecord.student.studentName || "-"}
                    </p>
                  </div>

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
                      Last 4 Characters
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">
                      {selectedRecord.student.lastFourCharacters || "-"}
                    </p>
                  </div>

                  <div className="rounded-md bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Signature Name
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">
                      {selectedRecord.student.studentSignatureName || "-"}
                    </p>
                  </div>
                </div>

                <div className="rounded-md border border-slate-200">
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-950">
                      Flight Entries
                    </p>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {selectedRecord.rows.map((row, index) => (
                      <div key={index} className="grid gap-3 p-4 text-sm md:grid-cols-3">
                        <p>
                          <span className="font-semibold text-slate-700">Date:</span>{" "}
                          {row.date || "-"}
                        </p>
                        <p>
                          <span className="font-semibold text-slate-700">Location:</span>{" "}
                          {row.location || "-"}
                        </p>
                        <p>
                          <span className="font-semibold text-slate-700">Duration:</span>{" "}
                          {row.duration || "-"} mins
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                Select a saved student record to preview the report.
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
