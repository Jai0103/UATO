"use client";

import { AppShell } from "@/components/app-shell";
import { getFlightLogRecords, type FlightLogRecord } from "@/lib/flight-log-storage";
import { generateFlightLogPdf } from "@/lib/pdf";
import { Download, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchGoogleRecords } from "@/lib/google-api";

export default function ReportsPage() {
  const [records, setRecords] = useState<FlightLogRecord[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState("");

useEffect(() => {
  async function loadRecords() {
    try {
      const googleRecords = await fetchGoogleRecords();
      setRecords(googleRecords);
    } catch {
      setRecords(getFlightLogRecords());
    }
  }

  loadRecords();
}, []);

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

  function toggleRecord(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function toggleAll() {
    const filteredIds = filteredRecords.map((record) => record.id);
    const allSelected = filteredIds.every((id) => selectedIds.includes(id));

    setSelectedIds(allSelected ? [] : filteredIds);
  }

  function generateSelectedReports() {
    const selectedRecords = records.filter((record) =>
      selectedIds.includes(record.id)
    );

    if (!selectedRecords.length) {
      setStatusMessage("Please tick at least one student flight log.");
      return;
    }

    selectedRecords.forEach((record) => {
      generateFlightLogPdf({
        student: record.student,
        rows: record.rows
      });
    });

    setStatusMessage(`${selectedRecords.length} PDF report(s) generated.`);
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Reports</h1>
            <p className="mt-1 text-sm text-slate-500">
              Select one or multiple student flight logs and generate PDF reports.
            </p>
          </div>

          <button
            onClick={generateSelectedReports}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand-navy px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Download size={17} />
            Generate Selected
          </button>
        </div>

        {statusMessage ? (
          <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm">
            {statusMessage}
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <label>
            <span className="text-sm font-medium text-slate-700">Search Reports</span>
            <div className="mt-2 flex h-11 items-center gap-2 rounded-md border border-slate-300 px-3 focus-within:border-brand-blue">
              <Search size={17} className="text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
                placeholder="Search student, company, or last 4 characters"
              />
            </div>
          </label>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <th className="w-[64px] px-4 py-3">
                    <input
                      type="checkbox"
                      checked={
                        filteredRecords.length > 0 &&
                        filteredRecords.every((record) =>
                          selectedIds.includes(record.id)
                        )
                      }
                      onChange={toggleAll}
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
                      {record.student.studentName || "-"}
                    </td>
                    <td className="px-4 py-4 text-slate-700">{record.student.company || "-"}</td>
                    <td className="px-4 py-4 text-slate-700">{record.student.lastFourCharacters || "-"}</td>
                    <td className="px-4 py-4 text-slate-700">{record.rows.length}</td>
                    <td className="px-4 py-4 text-slate-700">
                      {record.student.studentSignatureDataUrl ? "Captured" : "Missing"}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {new Date(record.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}

                {!filteredRecords.length ? (
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
    </AppShell>
  );
}
