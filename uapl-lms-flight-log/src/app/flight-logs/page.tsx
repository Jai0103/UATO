"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import { sessionKey } from "@/lib/demo-auth";
import { saveGoogleRecord } from "@/lib/google-api";
import {
  createFlightLogRecord,
  emptyRow,
  emptyStudent,
  flightLogDraftKey,
  saveFlightLogRecord,
  type FlightLogRow,
  type StudentDetails
} from "@/lib/flight-log-storage";
import { getMasterData, type MasterData } from "@/lib/master-data";
import { Pencil, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";

type FlightLogDraft = {
  recordId?: string;
  createdAt?: string;
  student: StudentDetails;
  rows: FlightLogRow[];
  updatedAt: string;
};

const fields: {
  key: keyof FlightLogRow;
  label: string;
  type?: "text" | "date" | "time" | "number" | "select";
}[] = [
  { key: "date", label: "Date", type: "date" },
  { key: "location", label: "Location", type: "select" },
  { key: "startTime", label: "Start Time", type: "time" },
  { key: "duration", label: "Duration (Mins)", type: "number" },
  { key: "uaModel", label: "UA Model & S/N" },
  { key: "uaCategory", label: "UA Category", type: "select" },
  { key: "batterySn", label: "Battery S/N" },
  { key: "pilotInCommand", label: "Pilot in Command" },
  { key: "instructorInCommand", label: "AFE / Instructor in Command" },
  { key: "remarks", label: "Remarks" }
];

export default function FlightLogsPage() {
  const { notify, confirm, clearMessage } = useAppMessage();

  const [student, setStudent] = useState<StudentDetails>(emptyStudent);
  const [rows, setRows] = useState<FlightLogRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [flightForm, setFlightForm] = useState<FlightLogRow>({ ...emptyRow });
  const [masterData, setMasterData] = useState<MasterData | null>(null);
  const [accountName, setAccountName] = useState("");
  const [isSigning, setIsSigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeRecordId, setActiveRecordId] = useState("");
  const [activeCreatedAt, setActiveCreatedAt] = useState("");

  useEffect(() => {
    setMasterData(getMasterData());

    const rawSession = localStorage.getItem(sessionKey);

    if (rawSession) {
      try {
        const parsedSession = JSON.parse(rawSession) as { name?: string };
        setAccountName(parsedSession.name ?? "");
      } catch {
        setAccountName("");
      }
    }

    const savedDraft = localStorage.getItem(flightLogDraftKey);

    if (!savedDraft) return;

    try {
      const parsedDraft = JSON.parse(savedDraft) as FlightLogDraft;
      setStudent(parsedDraft.student);
      setRows(parsedDraft.rows);

      setActiveRecordId(parsedDraft.recordId ?? "");
      setActiveCreatedAt(parsedDraft.createdAt ?? "");

      notify({
        type: "info",
        title: "Draft loaded",
        message: "Your previous flight log draft has been restored."
      });
    } catch {
      localStorage.removeItem(flightLogDraftKey);
    }
  }, [notify]);

  function updateStudent(field: keyof StudentDetails, value: string) {
    setStudent((currentStudent) => ({
      ...currentStudent,
      [field]: value
    }));
  }

  function updateFlightForm(field: keyof FlightLogRow, value: string) {
    setFlightForm((currentForm) => ({
      ...currentForm,
      [field]: value
    }));
  }

  function getCanvasPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();

    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function startSignature(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    const context = canvas.getContext("2d");
    if (!context) return;

    const point = getCanvasPoint(event);

    context.strokeStyle = "#111827";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(point.x, point.y);

    setIsSigning(true);
  }

  function drawSignature(event: PointerEvent<HTMLCanvasElement>) {
    if (!isSigning) return;

    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const point = getCanvasPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();

    updateStudent("studentSignatureDataUrl", canvas.toDataURL("image/png"));
  }

  function endSignature() {
    setIsSigning(false);

    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    updateStudent("studentSignatureDataUrl", canvas.toDataURL("image/png"));
  }

  function clearSignature() {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    updateStudent("studentSignatureDataUrl", "");

    notify({
      type: "info",
      title: "Signature cleared",
      message: "The student signature has been removed."
    });
  }

  function openAddFlightModal() {
    if (!student.studentName.trim()) {
      notify({
        type: "warning",
        title: "Student name required",
        message: "Enter the student name before adding a flight."
      });
      return;
    }

    setEditingIndex(null);
    setFlightForm({
      ...emptyRow,
      pilotInCommand: student.studentName,
      instructorInCommand: accountName
    });
    setModalOpen(true);
  }

function openEditFlightModal(index: number) {
  setEditingIndex(index);
  setFlightForm({
    ...rows[index],
    pilotInCommand: student.studentName
  });
  setModalOpen(true);
}
  function closeFlightModal() {
    setModalOpen(false);
    setEditingIndex(null);
    setFlightForm({ ...emptyRow });
  }

function saveFlightEntry() {
  const entryToSave: FlightLogRow =
    editingIndex === null
      ? {
          ...flightForm,
          pilotInCommand: student.studentName,
          instructorInCommand: accountName
        }
      : {
          ...flightForm,
          pilotInCommand: student.studentName
        };

  if (editingIndex === null) {
    setRows((currentRows) => [...currentRows, entryToSave]);
    notify({
      type: "success",
      title: "Flight added",
      message: "The flight entry has been added to the table."
    });
  } else {
    setRows((currentRows) =>
      currentRows.map((row, index) =>
        index === editingIndex ? entryToSave : row
      )
    );
    notify({
      type: "success",
      title: "Flight updated",
      message: "The flight entry has been updated."
    });
  }

  closeFlightModal();
}

  async function deleteFlightEntry(index: number) {
    const confirmed = await confirm({
      title: "Delete flight entry?",
      message: "This will remove the selected flight from the current record.",
      confirmLabel: "Delete",
      variant: "danger"
    });

    if (!confirmed) return;

    setRows((currentRows) =>
      currentRows.filter((_, rowIndex) => rowIndex !== index)
    );

    notify({
      type: "success",
      title: "Flight deleted",
      message: "The flight entry has been removed."
    });
  }

  function saveDraft() {
localStorage.setItem(
  flightLogDraftKey,
  JSON.stringify({
    recordId: activeRecordId,
    createdAt: activeCreatedAt,
    student,
    rows,
    updatedAt: new Date().toISOString()
  })
);

    notify({
      type: "success",
      title: "Draft saved",
      message: "Your flight log draft was saved on this device."
    });
  }

  async function clearDraft() {
    const confirmed = await confirm({
      title: "Clear current draft?",
      message: "This will remove the current student details, signature, and flight entries from this device.",
      confirmLabel: "Clear draft",
      variant: "danger"
    });

    if (!confirmed) return;

    localStorage.removeItem(flightLogDraftKey);
    setStudent(emptyStudent);
    setRows([]);

    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }

    notify({
      type: "success",
      title: "Draft cleared",
      message: "The current flight log draft has been cleared."
    });
  }

  async function saveRecord() {
    if (!student.studentName.trim()) {
      notify({
        type: "warning",
        title: "Student name required",
        message: "Enter the student name before saving the record."
      });
      return;
    }

    if (!student.studentSignatureDataUrl) {
      notify({
        type: "warning",
        title: "Signature required",
        message: "Capture the student signature before saving the record."
      });
      return;
    }

    if (!rows.length) {
      notify({
        type: "warning",
        title: "Flight entry required",
        message: "Add at least one flight entry before saving the record."
      });
      return;
    }

const record = createFlightLogRecord(student, rows, {
  id: activeRecordId || undefined,
  createdAt: activeCreatedAt || undefined
});

    notify({
      type: "loading",
      title: "Saving flight log...",
      message: "Please wait while the record syncs with Google Sheets."
    });

    try {
      const savedRecord = await saveGoogleRecord(record);
      saveFlightLogRecord(savedRecord.student, savedRecord.rows);
      setActiveRecordId(savedRecord.id);
      setActiveCreatedAt(savedRecord.createdAt);
      saveDraft();

      notify({
        type: "success",
        title: "Record saved",
        message: "Flight log record saved to Google Sheets."
      });
    } catch {
      saveFlightLogRecord(student, rows);
      saveDraft();

      notify({
        type: "error",
        title: "Google Sheets save failed",
        message: "The record was saved locally on this device."
      });
    } finally {
      setSaving(false);
      clearMessage();
    }
  }

  function renderModalField(field: (typeof fields)[number]) {
    const inputClass =
      "mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand-blue";

    if (field.key === "pilotInCommand") {
      return (
        <input
          className={`${inputClass} bg-slate-100 text-slate-600`}
          value={student.studentName}
          readOnly
        />
      );
    }

if (field.key === "instructorInCommand") {
  return (
    <input
      className={`${inputClass} bg-slate-100 text-slate-600`}
      value={flightForm.instructorInCommand || accountName}
      readOnly
    />
  );
}

    if (field.key === "location") {
      const locations = masterData?.locations ?? ["Kranji", "Old Holland"];

      return (
        <select
          className={inputClass}
          value={flightForm.location}
          onChange={(event) => updateFlightForm("location", event.target.value)}
        >
          <option value="">Select location</option>
          {locations.map((location) => (
            <option key={location} value={location}>
              {location}
            </option>
          ))}
        </select>
      );
    }

    if (field.key === "uaCategory") {
      const categories = masterData?.uaCategories ?? ["M7", "M25", "H"];

      return (
        <select
          className={inputClass}
          value={flightForm.uaCategory}
          onChange={(event) => updateFlightForm("uaCategory", event.target.value)}
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      );
    }

    const datalistOptions: Partial<Record<keyof FlightLogRow, string[]>> = {
      uaModel: masterData?.uaModels ?? [],
      batterySn: masterData?.batterySerialNumbers ?? []
    };

    const options = datalistOptions[field.key];
    const listId = options ? `flight-${field.key}-options` : undefined;

    return (
      <>
        <input
          type={field.type ?? "text"}
          min={field.type === "number" ? "0" : undefined}
          list={listId}
          className={inputClass}
          value={flightForm[field.key]}
          onChange={(event) => updateFlightForm(field.key, event.target.value)}
        />

        {options ? (
          <datalist id={listId}>
            {options.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        ) : null}
      </>
    );
  }

  return (
    <AppShell>
      {saving ? <LoadingOverlay label="Saving flight log..." /> : null}

      <div className="mx-auto w-full max-w-6xl min-w-0 space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Flight Log</h1>
            <p className="mt-1 text-sm text-slate-500">
              Save student details, capture signature, add flight entries, and prepare report records.
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
              onClick={saveRecord}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-navy px-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Save size={16} />
              Save Record
            </button>
          </div>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Student Details</h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label>
              <span className="text-sm font-medium text-slate-700">Student Name</span>
              <input
                value={student.studentName}
                onChange={(event) => updateStudent("studentName", event.target.value)}
                className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue"
                placeholder="Enter student name"
              />
            </label>

            <label>
              <span className="text-sm font-medium text-slate-700">Company</span>
              <input
                value={student.company}
                onChange={(event) => updateStudent("company", event.target.value)}
                className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue"
                placeholder="Enter company"
              />
            </label>

            <label>
              <span className="text-sm font-medium text-slate-700">Last 4 Characters</span>
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

            <div className="md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    Student Signature
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Sign using phone, tablet, or mouse.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={clearSignature}
                  className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Clear Signature
                </button>
              </div>

              <div className="mt-3 rounded-lg border border-slate-300 bg-white p-2">
                <canvas
                  ref={signatureCanvasRef}
                  width={900}
                  height={220}
                  onPointerDown={startSignature}
                  onPointerMove={drawSignature}
                  onPointerUp={endSignature}
                  onPointerCancel={endSignature}
                  onPointerLeave={endSignature}
                  className="h-44 w-full touch-none rounded-md bg-white"
                />
              </div>

              {student.studentSignatureDataUrl ? (
                <p className="mt-2 text-xs font-medium text-green-700">
                  Signature captured.
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  No signature captured yet.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Flight Entries</h2>
              <p className="mt-1 text-sm text-slate-500">
                Entries are added using the flight details form.
              </p>
            </div>

            <button
              onClick={openAddFlightModal}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-navy px-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Plus size={16} />
              Add Flight
            </button>
          </div>

          {rows.length ? (
            <>
              <div className="space-y-3 lg:hidden">
                {rows.map((row, index) => (
                  <article
                    key={index}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">
                          {row.date || "No date"} - {row.location || "No location"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.startTime || "--:--"} - {row.duration || "0"} mins -{" "}
                          {row.uaCategory}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditFlightModal(index)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                          aria-label="Edit row"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => deleteFlightEntry(index)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-red-50 hover:text-red-600"
                          aria-label="Delete row"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                      <p>
                        <span className="font-semibold text-slate-800">UA:</span>{" "}
                        {row.uaModel || "-"}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-800">Battery:</span>{" "}
                        {row.batterySn || "-"}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-800">PIC:</span>{" "}
                        {row.pilotInCommand || "-"}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-800">AFE:</span>{" "}
                        {row.instructorInCommand || "-"}
                      </p>
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden w-full overflow-x-auto rounded-md border border-slate-200 lg:block">
                <table className="w-full min-w-[1120px] table-fixed border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                      <th className="w-[110px] px-3 py-3 font-semibold">Date</th>
                      <th className="w-[130px] px-3 py-3 font-semibold">Location</th>
                      <th className="w-[110px] px-3 py-3 font-semibold">Start Time</th>
                      <th className="w-[110px] px-3 py-3 font-semibold">Duration</th>
                      <th className="w-[160px] px-3 py-3 font-semibold">UA Model & S/N</th>
                      <th className="w-[120px] px-3 py-3 font-semibold">UA Category</th>
                      <th className="w-[140px] px-3 py-3 font-semibold">Battery S/N</th>
                      <th className="w-[160px] px-3 py-3 font-semibold">Pilot in Command</th>
                      <th className="w-[170px] px-3 py-3 font-semibold">AFE / Instructor</th>
                      <th className="w-[150px] px-3 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={index} className="border-b border-slate-100">
                        <td className="px-3 py-3 text-slate-700">{row.date || "-"}</td>
                        <td className="px-3 py-3 text-slate-700">{row.location || "-"}</td>
                        <td className="px-3 py-3 text-slate-700">{row.startTime || "-"}</td>
                        <td className="px-3 py-3 text-slate-700">{row.duration || "-"}</td>
                        <td className="px-3 py-3 text-slate-700">{row.uaModel || "-"}</td>
                        <td className="px-3 py-3 text-slate-700">{row.uaCategory || "-"}</td>
                        <td className="px-3 py-3 text-slate-700">{row.batterySn || "-"}</td>
                        <td className="px-3 py-3 text-slate-700">{row.pilotInCommand || "-"}</td>
                        <td className="px-3 py-3 text-slate-700">{row.instructorInCommand || "-"}</td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => openEditFlightModal(index)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                              aria-label="Edit row"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => deleteFlightEntry(index)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600"
                              aria-label="Delete row"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <p className="text-sm font-semibold text-slate-800">No flight entries yet.</p>
              <p className="mt-1 text-sm text-slate-500">
                Click Add Flight to enter the first flight details.
              </p>
            </div>
          )}
        </section>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  {editingIndex === null ? "Add Flight" : "Edit Flight"}
                </h2>
                <p className="text-sm text-slate-500">
                  Enter the flight details for this student.
                </p>
              </div>

              <button
                onClick={closeFlightModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {fields.map((field) => (
                <label
                  key={field.key}
                  className={field.key === "remarks" ? "sm:col-span-2" : ""}
                >
                  <span className="text-sm font-medium text-slate-700">
                    {field.label}
                  </span>
                  {renderModalField(field)}
                </label>
              ))}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 p-5 sm:flex-row sm:justify-end">
              <button
                onClick={closeFlightModal}
                className="inline-flex h-11 items-center justify-center rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                onClick={saveFlightEntry}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand-navy px-4 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Save size={16} />
                {editingIndex === null ? "Add Flight" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
