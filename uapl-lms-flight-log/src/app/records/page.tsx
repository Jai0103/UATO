"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import { useRouter } from "next/navigation";
import { flightLogDraftKey } from "@/lib/flight-log-storage";
import {
  getFlightLogRecords,
  type FlightLogRecord
} from "@/lib/flight-log-storage";
import { fetchGoogleRecords } from "@/lib/google-api";
import { Eye, FilePenLine, FileText, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export default function RecordsPage() {
  const router = useRouter();
  const { notify } = useAppMessage();

  const [records, setRecords] = useState<FlightLogRecord[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<FlightLogRecord | null>(
    null
  );
function continueRecord(record: FlightLogRecord) {
  localStorage.setItem(
    flightLogDraftKey,
    JSON.stringify({
      recordId: record.id,
      createdAt: record.createdAt,
      student: record.student,
      rows: record.rows,
      updatedAt: new Date().toISOString()
    })
  );

  notify({
    type: "success",
    title: "Record loaded",
    message: `${record.student.studentName} is ready to continue in Flight Logs.`
  });

  router.push("/flight-logs");
}
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

  return (
    <AppShell>
      {loading ? <LoadingOverlay label="Loading saved records..." /> : null}

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
                {filteredRecords.map((record) => (
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
                      {record.updatedAt
                        ? new Date(record.updatedAt).toLocaleString()
                        : "-"}
                    </td>
<td className="px-4 py-4">
  <div className="flex gap-2">
    <button
      onClick={() => setSelectedRecord(record)}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-950"
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

                {!filteredRecords.length && !loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No saved records found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
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
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
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
                          <td className="px-4 py-3">{row.pilotInCommand || "-"}</td>
                          <td className="px-4 py-3">{row.instructorInCommand || "-"}</td>
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
