"use client";

import { AppShell } from "@/components/app-shell";
import {
  emptyRow,
  emptyStudent,
  flightLogDraftKey,
  saveFlightLogRecord,
  type FlightLogRow,
  type StudentDetails
} from "@/lib/flight-log-storage";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

type FlightLogDraft = {
  student: StudentDetails;
  rows: FlightLogRow[];
  updatedAt: string;
};

const fields: {
  key: keyof FlightLogRow;
  label: string;
  type?: "text" | "date" | "time" | "number" | "select";
  width: string;
}[] = [
  { key: "date", label: "Date", type: "date", width: "w-[110px]" },
  { key: "location", label: "Location", width: "w-[130px]" },
  { key: "startTime", label: "Start Time", type: "time", width: "w-[110px]" },
  { key: "duration", label: "Duration", type: "number", width: "w-[110px]" },
  { key: "uaModel", label: "UA Model & S/N", width: "w-[160px]" },
  { key: "uaCategory", label: "UA Category", type: "select", width: "w-[120px]" },
  { key: "batterySn", label: "Battery S/N", width: "w-[140px]" },
  { key: "pilotInCommand", label: "Pilot in Command", width: "w-[160px]" },
  { key: "instructorInCommand", label: "AFE / Instructor", width: "w-[170px]" },
  { key: "remarks", label: "Remarks", width: "w-[180px]" }
];

export default function FlightLogsPage() {
  const [student, setStudent] = useState<StudentDetails>(emptyStudent);
  const [rows, setRows] = useState<FlightLogRow[]>([{ ...emptyRow }]);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    const savedDraft = localStorage.getItem(flightLogDraftKey);

    if (!savedDraft) return;

    try {
      const parsedDraft = JSON.parse(savedDraft) as FlightLogDraft;
      setStudent(parsedDraft.student);
      setRows(parsedDraft.rows.length ? parsedDraft.rows : [{ ...emptyRow }]);
      setStatusMessage("Draft loaded.");
    } catch {
      localStorage.removeItem(flightLogDraftKey);
    }
  }, []);

  function updateStudent(field: keyof StudentDetails, value: string) {
    setStudent((currentStudent) => ({
      ...currentStudent,
      [field]: value
    }));
  }

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

  function removeRow(index: number) {
    setRows((currentRows) =>
      currentRows.length === 1
        ? [{ ...emptyRow }]
        : currentRows.filter((_, rowIndex) => rowIndex !== index)
    );
  }

  function saveDraft() {
    localStorage.setItem(
      flightLogDraftKey,
      JSON.stringify({
        student,
        rows,
        updatedAt: new Date().toISOString()
      })
    );

    setStatusMessage("Draft saved.");
  }

  function clearDraft() {
    localStorage.removeItem(flightLogDraftKey);
    setStudent(emptyStudent);
    setRows([{ ...emptyRow }]);
    setStatusMessage("Draft cleared.");
  }

  function saveRecord() {
    if (!student.studentName.trim()) {
      setStatusMessage("Please enter the student name before saving.");
      return;
    }

    saveFlightLogRecord(student, rows);
    saveDraft();
    setStatusMessage("Flight log record saved. Generate the PDF from Reports.");
  }

  function renderField(row: FlightLogRow, rowIndex: number, field: (typeof fields)[number]) {
    const inputClass =
      "h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-brand-blue";

    if (field.type === "select") {
      return (
        <select
          className={inputClass}
          value={row[field.key]}
          onChange={(event) => updateRow(rowIndex, field.key, event.target.value)}
        >
          <option value="M7">M7</option>
          <option value="M25">M25</option>
          <option value="H">H</option>
        </select>
      );
    }

    return (
      <input
        type={field.type ?? "text"}
        min={field.type === "number" ? "0" : undefined}
        className={inputClass}
        value={row[field.key]}
        onChange={(event) => updateRow(rowIndex, field.key, event.target.value)}
      />
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl min-w-0 space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Flight Log</h1>
            <p className="mt-1 text-sm text-slate-500">
              Capture student flight details and save them as report records.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={clearDraft} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <RotateCcw size={16} />
              Clear
            </button>

            <button onClick={saveDraft} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Save size={16} />
              Save Draft
            </button>

            <button onClick={saveRecord} className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-navy px-3 text-sm font-semibold text-white hover:bg-slate-800">
              <Save size={16} />
              Save Record
            </button>
          </div>
        </div>

        {statusMessage ? (
          <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm">
            {statusMessage}
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Student Details</h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label>
              <span className="text-sm font-medium text-slate-700">Student Name</span>
              <input value={student.studentName} onChange={(event) => updateStudent("studentName", event.target.value)} className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue" placeholder="Enter student name" />
            </label>

            <label>
              <span className="text-sm font-medium text-slate-700">Company</span>
              <input value={student.company} onChange={(event) => updateStudent("company", event.target.value)} className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue" placeholder="Enter company" />
            </label>

            <label>
              <span className="text-sm font-medium text-slate-700">Last 4 Characters</span>
              <input value={student.lastFourCharacters} onChange={(event) => updateStudent("lastFourCharacters", event.target.value.slice(0, 4))} maxLength={4} className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm uppercase outline-none focus:border-brand-blue" placeholder="A123" />
            </label>

            <label>
              <span className="text-sm font-medium text-slate-700">Student Signature Name</span>
              <input value={student.studentSignatureName} onChange={(event) => updateStudent("studentSignatureName", event.target.value)} className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue" placeholder="Printed signature name" />
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <h2 className="text-lg font-semibold text-slate-950">Flight Entries</h2>

            <button onClick={addRow} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Plus size={16} />
              Add Row
            </button>
          </div>

          <div className="space-y-4 lg:hidden">
            {rows.map((row, rowIndex) => (
              <article key={rowIndex} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">Entry {rowIndex + 1}</p>
                  <button onClick={() => removeRow(rowIndex)} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label="Remove row">
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {fields.map((field) => (
                    <label key={field.key} className={field.key === "remarks" ? "sm:col-span-2" : ""}>
                      <span className="text-xs font-semibold uppercase text-slate-500">{field.label}</span>
                      <div className="mt-2">{renderField(row, rowIndex, field)}</div>
                    </label>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="hidden w-full overflow-x-auto rounded-md border border-slate-200 lg:block">
            <table className="w-full min-w-[1310px] table-fixed border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  {fields.map((field) => (
                    <th key={field.key} className={`${field.width} px-3 py-3 font-semibold`}>
                      {field.label}
                    </th>
                  ))}
                  <th className="w-[60px] px-3 py-3 font-semibold"></th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-slate-100">
                    {fields.map((field) => (
                      <td key={field.key} className="p-2">
                        {renderField(row, rowIndex, field)}
                      </td>
                    ))}
                    <td className="p-2">
                      <button onClick={() => removeRow(rowIndex)} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label="Remove row">
                        <Trash2 size={16} />
                      </button>
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
