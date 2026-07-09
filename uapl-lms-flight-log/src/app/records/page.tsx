"use client";

import { AppShell } from "@/components/app-shell";
import { getFlightLogRecords, type FlightLogRecord } from "@/lib/flight-log-storage";
import { FileText, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchGoogleRecords } from "@/lib/google-api";

export default function RecordsPage() {
  const [records, setRecords] = useState<FlightLogRecord[]>([]);
  const [query, setQuery] = useState("");

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

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Records</h1>
          <p className="mt-1 text-sm text-slate-500">
            View all saved student flight log records.
          </p>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <label>
            <span className="text-sm font-medium text-slate-700">Search Records</span>
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
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">Last 4</th>
                  <th className="px-4 py-3 font-semibold">Flights</th>
                  <th className="px-4 py-3 font-semibold">Updated</th>
                </tr>
              </thead>

              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="border-b border-slate-100">
                    <td className="px-4 py-4 font-semibold text-slate-950">
                      <span className="inline-flex items-center gap-2">
                        <FileText size={16} className="text-brand-navy" />
                        {record.student.studentName || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{record.student.company || "-"}</td>
                    <td className="px-4 py-4 text-slate-700">{record.student.lastFourCharacters || "-"}</td>
                    <td className="px-4 py-4 text-slate-700">{record.rows.length}</td>
                    <td className="px-4 py-4 text-slate-700">
                      {new Date(record.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}

                {!filteredRecords.length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
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
