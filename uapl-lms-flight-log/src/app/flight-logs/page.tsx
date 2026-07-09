"use client";

import { Plus, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useEffect, useState } from "react";

type StudentDetails = {
  studentName: string;
  company: string;
  lastFourCharacters: string;
  studentSignatureName: string;
};

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

type FlightLogDraft = {
  student: StudentDetails;
  rows: FlightLogRow[];
  updatedAt: string;
};

const draftKey = "uapl_flight_log_draft";

const emptyStudent: StudentDetails = {
  studentName: "",
  company: "",
  lastFourCharacters: "",
  studentSignatureName: ""
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
  const [student, setStudent] = useState<StudentDetails>(emptyStudent);
  const [rows, setRows] = useState<FlightLogRow[]>([{ ...emptyRow }]);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    const savedDraft = localStorage.getItem(draftKey);

    if (!savedDraft) {
      return;
    }

    try {
      const parsedDraft = JSON.parse(savedDraft) as FlightLogDraft;
      setStudent(parsedDraft.student);
      setRows(parsedDraft.rows.length ? parsedDraft.rows : [{ ...emptyRow }]);
      setStatusMessage("Draft loaded.");
    } catch {
      localStorage.removeItem(draftKey);
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
    setRows((currentRows) => {
      if (currentRows.length === 1) {
        return [{ ...emptyRow }];
      }

      return currentRows.filter((_, rowIndex) => rowIndex !== index);
    });
  }

  function saveDraft() {
    const draft: FlightLogDraft = {
      student,
      rows,
      updatedAt: new Date().toISOString()
    };

    localStorage.setItem(draftKey, JSON.stringify(draft));
    setStatusMessage("Draft saved.");
  }

  function clearDraft() {
    localStorage.removeItem(draftKey);
    setStudent(emptyStudent);
    setRows([{ ...emptyRow }]);
    setStatusMessage("Draft cleared.");
  }

  function handleUpload() {
    saveDraft();
    setStatusMessage("Draft saved. PDF upload will be added in the next step.");
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

          <div className="flex flex-wrap gap-2">
            <button
              onClick={clearDraft}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw size={16} />
              Clear
            </button>

            <button
              onClick={saveDraft}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Save size={16} />
              Save Draft
            </button>

            <button
              onClick={handleUpload}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-navy px-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Upload size={16} />
              Upload
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
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Student Name</span>
              <input
                value={student.studentName}
                onChange={(event) =>
                  updateStudent("studentName", event.target.value)
                }
                className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue"
                placeholder="Enter student name"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Company</span>
              <input
                value={student.company}
                onChange={(event) => updateStudent("company", event.target.value)}
                className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue"
                placeholder="Enter company"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Last 4 Characters
              </span>
              <input
                value={student.lastFourCharacters}
                onChange={(event) =>
                  updateStudent("lastFourCharacters", event.target.value.slice(0, 4))
                }
                maxLength={4}
                className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm uppercase outline-none focus:border-brand-blue"
                placeholder="A123"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Student Signature Name
              </span>
              <input
                value={student.studentSignatureName}
                onChange={(event) =>
                  updateStudent("studentSignatureName", event.target.value)
                }
                className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue"
                placeholder="Printed signature name"
              />
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <h2 className="text-lg font-semibold text-slate-950">Flight Entries</h2>

            <button
              onClick={addRow}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus size={16} />
              Add Row
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1280px] border-collapse text-left text-sm">
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
                    "Remarks",
                    ""
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
                      <input
                        type="date"
                        className="h-10 w-full rounded-md border border-slate-300 px-2"
                        value={row.date}
                        onChange={(event) =>
                          updateRow(index, "date", event.target.value)
                        }
                      />
                    </td>

                    <td className="p-2">
                      <input
                        className="h-10 w-full rounded-md border border-slate-300 px-2"
                        value={row.location}
                        onChange={(event) =>
                          updateRow(index, "location", event.target.value)
                        }
                      />
                    </td>

                    <td className="p-2">
                      <input
                        type="time"
                        className="h-10 w-full rounded-md border border-slate-300 px-2"
                        value={row.startTime}
                        onChange={(event) =>
                          updateRow(index, "startTime", event.target.value)
                        }
                      />
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        className="h-10 w-full rounded-md border border-slate-300 px-2"
                        value={row.duration}
                        onChange={(event) =>
                          updateRow(index, "duration", event.target.value)
                        }
                      />
                    </td>

                    <td className="p-2">
                      <input
                        className="h-10 w-full rounded-md border border-slate-300 px-2"
                        value={row.uaModel}
                        onChange={(event) =>
                          updateRow(index, "uaModel", event.target.value)
                        }
                      />
                    </td>

                    <td className="p-2">
                      <select
                        className="h-10 w-full rounded-md border border-slate-300 px-2"
                        value={row.uaCategory}
                        onChange={(event) =>
                          updateRow(index, "uaCategory", event.target.value)
                        }
                      >
                        <option value="M7">M7</option>
                        <option value="M25">M25</option>
                        <option value="H">H</option>
                      </select>
                    </td>

                    <td className="p-2">
                      <input
                        className="h-10 w-full rounded-md border border-slate-300 px-2"
                        value={row.batterySn}
                        onChange={(event) =>
                          updateRow(index, "batterySn", event.target.value)
                        }
                      />
                    </td>

                    <td className="p-2">
                      <input
                        className="h-10 w-full rounded-md border border-slate-300 px-2"
                        value={row.pilotInCommand}
                        onChange={(event) =>
                          updateRow(index, "pilotInCommand", event.target.value)
                        }
                      />
                    </td>

                    <td className="p-2">
                      <input
                        className="h-10 w-full rounded-md border border-slate-300 px-2"
                        value={row.instructorInCommand}
                        onChange={(event) =>
                          updateRow(index, "instructorInCommand", event.target.value)
                        }
                      />
                    </td>

                    <td className="p-2">
                      <input
                        className="h-10 w-full rounded-md border border-slate-300 px-2"
                        value={row.remarks}
                        onChange={(event) =>
                          updateRow(index, "remarks", event.target.value)
                        }
                      />
                    </td>

                    <td className="p-2">
                      <button
                        onClick={() => removeRow(index)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600"
                        aria-label="Remove row"
                      >
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
