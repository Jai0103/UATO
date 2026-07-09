"use client";

import { Plus, Save, Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useState } from "react";

type FlightLogRow = {
  date: string;
  location: string;
  startTime: string;
  duration: string;
  uaModel: string;
  uaCategory: string;
  batterySn: string;
  pilotInCommand: string;
  instructorInCommand: string;
  remarks: string;
};

const emptyRow: FlightLogRow = {
  date: "",
  location: "",
  startTime: "",
  duration: "",
  uaModel: "",
  uaCategory: "M7",
  batterySn: "",
  pilotInCommand: "",
  instructorInCommand: "",
  remarks: ""
};

export default function FlightLogsPage() {
  const [rows, setRows] = useState<FlightLogRow[]>([{ ...emptyRow }]);

  function updateRow(index: number, field: keyof FlightLogRow, value: string) {
    setRows((currentRows) =>
      currentRows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      )
    );
  }

  function addRow() {
    setRows((currentRows) => [...currentRows, { ...emptyRow }]);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Flight Log</h1>
            <p className="mt-1 text-sm text-slate-500">
              Create and prepare student flight log reports.
            </p>
          </div>

          <div className="flex gap-2">
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
              <Save size={16} />
              Save Draft
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-navy px-3 text-sm font-semibold text-white">
              <Upload size={16} />
              Upload
            </button>
          </div>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Student Details</h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <input className="h-11 rounded-md border border-slate-300 px-3 text-sm" placeholder="Student Name" />
            <input className="h-11 rounded-md border border-slate-300 px-3 text-sm" placeholder="Company" />
            <input className="h-11 rounded-md border border-slate-300 px-3 text-sm" placeholder="Last 4 Characters" />
            <input className="h-11 rounded-md border border-slate-300 px-3 text-sm" placeholder="Student Signature Name" />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-950">Flight Entries</h2>
            <button
              onClick={addRow}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700"
            >
              <Plus size={16} />
              Add Row
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1200px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  {[
                    "Date",
                    "Location",
                    "Start Time",
                    "Duration",
                    "UA Model & S/N",
                    "UA Category",
                    "Battery S/N",
                    "Pilot in Command",
                    "AFE / Instructor",
                    "Remarks"
                  ].map((heading) => (
                    <th key={heading} className="px-3 py-3 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className="border-b border-slate-100">
                    <td className="p-2">
                      <input type="date" className="h-10 w-full rounded-md border border-slate-300 px-2" value={row.date} onChange={(e) => updateRow(index, "date", e.target.value)} />
                    </td>
                    <td className="p-2">
                      <input className="h-10 w-full rounded-md border border-slate-300 px-2" value={row.location} onChange={(e) => updateRow(index, "location", e.target.value)} />
                    </td>
                    <td className="p-2">
                      <input type="time" className="h-10 w-full rounded-md border border-slate-300 px-2" value={row.startTime} onChange={(e) => updateRow(index, "startTime", e.target.value)} />
                    </td>
                    <td className="p-2">
                      <input className="h-10 w-full rounded-md border border-slate-300 px-2" value={row.duration} onChange={(e) => updateRow(index, "duration", e.target.value)} />
                    </td>
                    <td className="p-2">
                      <input className="h-10 w-full rounded-md border border-slate-300 px-2" value={row.uaModel} onChange={(e) => updateRow(index, "uaModel", e.target.value)} />
                    </td>
                    <td className="p-2">
                      <select className="h-10 w-full rounded-md border border-slate-300 px-2" value={row.uaCategory} onChange={(e) => updateRow(index, "uaCategory", e.target.value)}>
                        <option>M7</option>
                        <option>M25</option>
                        <option>H</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <input className="h-10 w-full rounded-md border border-slate-300 px-2" value={row.batterySn} onChange={(e) => updateRow(index, "batterySn", e.target.value)} />
                    </td>
                    <td className="p-2">
                      <input className="h-10 w-full rounded-md border border-slate-300 px-2" value={row.pilotInCommand} onChange={(e) => updateRow(index, "pilotInCommand", e.target.value)} />
                    </td>
                    <td className="p-2">
                      <input className="h-10 w-full rounded-md border border-slate-300 px-2" value={row.instructorInCommand} onChange={(e) => updateRow(index, "instructorInCommand", e.target.value)} />
                    </td>
                    <td className="p-2">
                      <input className="h-10 w-full rounded-md border border-slate-300 px-2" value={row.remarks} onChange={(e) => updateRow(index, "remarks", e.target.value)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
