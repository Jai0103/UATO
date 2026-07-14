"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import { sessionKey } from "@/lib/demo-auth";
import {
  fetchGoogleMasterData,
  saveGoogleRecord,
  validateGoogleFlightRecord,
} from "@/lib/google-api";
import {
  createFlightLogRecord,
  emptyRow,
  emptyStudent,
  flightLogDraftKey,
  saveFlightLogRecord,
  type FlightLogRecord,
  type FlightLogRow,
  type StudentDetails,
} from "@/lib/flight-log-storage";
import {
  getMasterData,
  saveMasterData,
  type MasterData,
} from "@/lib/master-data";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileCheck2,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Signature,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";

type StepKey = "details" | "signature" | "flights" | "review";

type FlightLogDraft = {
  recordId?: string;
  createdAt?: string;
  student: StudentDetails;
  rows: FlightLogRow[];
  updatedAt: string;
};

const steps: { key: StepKey; title: string }[] = [
  { key: "details", title: "Student" },
  { key: "signature", title: "Signature" },
  { key: "flights", title: "Flights" },
  { key: "review", title: "Review" },
];

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
  { key: "remarks", label: "Remarks" },
];

function hasStudentDetails(student: StudentDetails) {
  return Boolean(
    student.studentName.trim() &&
      student.company.trim() &&
      student.lastFourCharacters.trim()
  );
}

export default function FlightLogsPage() {
  const { notify, confirm, clearMessage } = useAppMessage();

  const [activeStep, setActiveStep] = useState<StepKey>("details");
  const [student, setStudent] = useState<StudentDetails>(emptyStudent);
  const [rows, setRows] = useState<FlightLogRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [flightForm, setFlightForm] = useState<FlightLogRow>({ ...emptyRow });
  const [masterData, setMasterData] = useState<MasterData | null>(null);
  const [accountName, setAccountName] = useState("");
  const [isSigning, setIsSigning] = useState(false);
  const [signatureLocked, setSignatureLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeRecordId, setActiveRecordId] = useState("");
  const [activeCreatedAt, setActiveCreatedAt] = useState("");
  const [activeSuggestField, setActiveSuggestField] =
    useState<keyof FlightLogRow | null>(null);

  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const detailsDone = hasStudentDetails(student);
  const signatureDone = Boolean(student.studentSignatureDataUrl);
  const flightsDone = rows.length > 0;
  const completedCount = [detailsDone, signatureDone, flightsDone].filter(Boolean).length;

  useEffect(() => {
    setMasterData(getMasterData());

    fetchGoogleMasterData()
      .then((googleMasterData) => {
        setMasterData(googleMasterData);
        saveMasterData(googleMasterData);
      })
      .catch(() => {
        notify({
          type: "warning",
          title: "Using local Master Data",
          message: "The latest active reference values could not be loaded from Google Sheets.",
        });
      });

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
      setSignatureLocked(
        Boolean(parsedDraft.recordId && parsedDraft.student.studentSignatureDataUrl)
      );

      notify({
        type: "info",
        title: parsedDraft.recordId ? "Record loaded" : "Draft loaded",
        message: parsedDraft.recordId
          ? "This student record is ready to continue."
          : "Your previous flight log draft has been restored.",
      });
    } catch {
      localStorage.removeItem(flightLogDraftKey);
    }
  }, [notify]);

  useEffect(() => {
    if (!student.studentSignatureDataUrl) return;

    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = student.studentSignatureDataUrl;
  }, [student.studentSignatureDataUrl, activeStep]);

  function updateStudent(field: keyof StudentDetails, value: string) {
    setStudent((current) => ({ ...current, [field]: value }));
  }

  function updateFlightForm(field: keyof FlightLogRow, value: string) {
    setFlightForm((current) => ({ ...current, [field]: value }));
  }

  function goNext() {
    if (activeStep === "details" && !detailsDone) {
      notify({
        type: "warning",
        title: "Complete student details",
        message: "Enter student name, company, and last 4 characters.",
      });
      return;
    }

    if (activeStep === "signature" && !signatureDone) {
      notify({
        type: "warning",
        title: "Signature required",
        message: "Capture the student signature before continuing.",
      });
      return;
    }

    if (activeStep === "flights" && !flightsDone) {
      notify({
        type: "warning",
        title: "Flight entry required",
        message: "Add at least one flight entry before review.",
      });
      return;
    }

    const index = steps.findIndex((step) => step.key === activeStep);
    setActiveStep(steps[Math.min(index + 1, steps.length - 1)].key);
  }

  function goBack() {
    const index = steps.findIndex((step) => step.key === activeStep);
    setActiveStep(steps[Math.max(index - 1, 0)].key);
  }

  function getCanvasPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();

    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function startSignature(event: PointerEvent<HTMLCanvasElement>) {
    if (signatureLocked) return;

    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    event.currentTarget.setPointerCapture(event.pointerId);

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
    if (!isSigning || signatureLocked) return;

    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const point = getCanvasPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function endSignature() {
    if (!isSigning || signatureLocked) return;

    setIsSigning(false);

    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    updateStudent("studentSignatureDataUrl", canvas.toDataURL("image/png"));
  }

  function retakeSignature() {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    updateStudent("studentSignatureDataUrl", "");
    setSignatureLocked(false);
    setIsSigning(false);

    notify({
      type: "info",
      title: "Signature ready",
      message: "The student can sign again.",
    });
  }

  function openAddFlightModal() {
    if (!student.studentName.trim()) {
      notify({
        type: "warning",
        title: "Student name required",
        message: "Enter the student name before adding a flight.",
      });
      return;
    }

    setEditingIndex(null);
    setFlightForm({
      ...emptyRow,
      pilotInCommand: student.studentName,
      instructorInCommand: accountName,
    });
    setModalOpen(true);
  }

  function openEditFlightModal(index: number) {
    setEditingIndex(index);
    setFlightForm({
      ...rows[index],
      pilotInCommand: student.studentName,
    });
    setModalOpen(true);
  }

  function closeFlightModal() {
    setModalOpen(false);
    setEditingIndex(null);
    setFlightForm({ ...emptyRow });
    setActiveSuggestField(null);
  }

  async function saveFlightEntry() {
    const entryToSave: FlightLogRow =
      editingIndex === null
        ? {
            ...flightForm,
            pilotInCommand: student.studentName,
            instructorInCommand: accountName,
          }
        : {
            ...flightForm,
            pilotInCommand: student.studentName,
          };

    const validation = validateFlightEntry(
      entryToSave,
      masterData,
      rows,
      editingIndex
    );

    if (validation.errors.length) {
      notify({
        type: "error",
        title: "Flight entry is not valid",
        message: validation.errors.join(" "),
      });
      return;
    }

    if (validation.warnings.length) {
      const proceed = await confirm({
        title: "Battery overlap detected",
        message: validation.warnings.join(" "),
        confirmLabel: "Add anyway",
      });

      if (!proceed) return;
    }

    if (editingIndex === null) {
      setRows((current) => [...current, entryToSave]);
      notify({ type: "success", title: "Flight added" });
    } else {
      setRows((current) =>
        current.map((row, index) => (index === editingIndex ? entryToSave : row))
      );
      notify({ type: "success", title: "Flight updated" });
    }

    closeFlightModal();
  }

  async function deleteFlightEntry(index: number) {
    const confirmed = await confirm({
      title: "Delete flight entry?",
      message: "This will remove the selected flight from the current record.",
      confirmLabel: "Delete",
      variant: "danger",
    });

    if (!confirmed) return;

    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
    notify({ type: "success", title: "Flight deleted" });
  }

  function saveDraft() {
    localStorage.setItem(
      flightLogDraftKey,
      JSON.stringify({
        recordId: activeRecordId,
        createdAt: activeCreatedAt,
        student,
        rows,
        updatedAt: new Date().toISOString(),
      })
    );

    notify({
      type: "success",
      title: "Draft saved",
      message: "Your flight log draft was saved on this device.",
    });
  }

  async function clearDraft() {
    const confirmed = await confirm({
      title: "Clear current draft?",
      message:
        "This will remove the current student details, signature, and flight entries from this device.",
      confirmLabel: "Clear draft",
      variant: "danger",
    });

    if (!confirmed) return;

    localStorage.removeItem(flightLogDraftKey);
    setStudent(emptyStudent);
    setRows([]);
    setActiveRecordId("");
    setActiveCreatedAt("");
    setSignatureLocked(false);
    setActiveStep("details");

    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);

    notify({ type: "success", title: "Draft cleared" });
  }

  async function saveRecord() {
    if (!detailsDone) {
      setActiveStep("details");
      notify({
        type: "warning",
        title: "Student details required",
        message: "Complete the student details before saving.",
      });
      return;
    }

    if (!signatureDone) {
      setActiveStep("signature");
      notify({
        type: "warning",
        title: "Signature required",
        message: "Capture the student signature before saving.",
      });
      return;
    }

    if (!flightsDone) {
      setActiveStep("flights");
      notify({
        type: "warning",
        title: "Flight entry required",
        message: "Add at least one flight entry before saving.",
      });
      return;
    }

    const newRecord = createFlightLogRecord(student, rows);
    const record: FlightLogRecord = activeRecordId
      ? {
          ...newRecord,
          id: activeRecordId,
          createdAt: activeCreatedAt || newRecord.createdAt,
        }
      : newRecord;

    setSaving(true);

    notify({
      type: "loading",
      title: "Saving flight log...",
      message: "Please wait while the record syncs with Google Sheets.",
    });

    try {
      const validation = await validateGoogleFlightRecord(record);

      if (validation.errors.length) {
        throw new Error(validation.errors.join(" "));
      }

      if (validation.warnings.length) {
        clearMessage();

        const proceed = await confirm({
          title: "Battery overlap detected",
          message: validation.warnings.join(" "),
          confirmLabel: "Save anyway",
        });

        if (!proceed) {
          notify({
            type: "info",
            title: "Save cancelled",
            message: "Review the battery allocation before saving.",
          });
          return;
        }

        notify({
          type: "loading",
          title: "Saving flight log...",
          message: "Battery warning acknowledged. Syncing with Google Sheets.",
        });
      }

      const savedRecord = await saveGoogleRecord(record);
      saveFlightLogRecord(savedRecord.student, savedRecord.rows);
      setActiveRecordId(savedRecord.id);
      setActiveCreatedAt(savedRecord.createdAt);
      setSignatureLocked(true);

      localStorage.setItem(
        flightLogDraftKey,
        JSON.stringify({
          recordId: savedRecord.id,
          createdAt: savedRecord.createdAt,
          student: savedRecord.student,
          rows: savedRecord.rows,
          updatedAt: new Date().toISOString(),
        })
      );

      clearMessage();
      notify({
        type: "success",
        title: "Record saved",
        message: "Flight log record saved to Google Sheets.",
      });
    } catch (error) {
      clearMessage();
      notify({
        type: "error",
        title: "Flight log was not saved",
        message:
          error instanceof Error
            ? error.message
            : "Check the flight details and try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  function renderSmartSuggestionField(
    fieldKey: keyof FlightLogRow,
    options: string[]
  ) {
    const value = String(flightForm[fieldKey] ?? "");
    const cleanValue = value.trim().toLowerCase();

    const filteredOptions = options
      .filter((option) => !cleanValue || option.toLowerCase().includes(cleanValue))
      .slice(0, 12);

    const showSuggestions =
      activeSuggestField === fieldKey && filteredOptions.length > 0;

    return (
      <div className="relative">
        <input
          type="text"
          className="mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-brand-blue md:h-11 md:text-sm"
          value={value}
          onFocus={() => setActiveSuggestField(fieldKey)}
          onChange={(event) => {
            updateFlightForm(fieldKey, event.target.value);
            setActiveSuggestField(fieldKey);
          }}
          onBlur={() => window.setTimeout(() => setActiveSuggestField(null), 150)}
          placeholder={
            fieldKey === "uaModel"
              ? "Search UA model or serial number"
              : "Search battery serial number"
          }
        />

        {showSuggestions ? (
          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[80] max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
            {filteredOptions.map((option) => (
              <button
                key={option}
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  updateFlightForm(fieldKey, option);
                  setActiveSuggestField(null);
                }}
                className="block w-full rounded-lg px-3 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  function renderModalField(field: (typeof fields)[number]) {
    const inputClass =
      "mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-brand-blue md:h-11 md:text-sm";

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
          <option value="">Select category</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      );
    }

    if (field.key === "uaModel") {
      return renderSmartSuggestionField("uaModel", masterData?.uaModels ?? []);
    }

    if (field.key === "batterySn") {
      return renderSmartSuggestionField(
        "batterySn",
        masterData?.batterySerialNumbers ?? []
      );
    }

    return (
      <input
        type={field.type ?? "text"}
        min={field.type === "number" ? "0" : undefined}
        className={inputClass}
        value={flightForm[field.key]}
        onChange={(event) => updateFlightForm(field.key, event.target.value)}
      />
    );
  }

  function renderStepContent() {
    if (activeStep === "details") {
      return (
        <section className="app-card">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-navy text-white">
              <UserRound size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Student Details
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Enter the report header information first.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label>
              <span className="text-sm font-medium text-slate-700">
                Student Name
              </span>
              <input
                value={student.studentName}
                onChange={(event) => updateStudent("studentName", event.target.value)}
                className="app-input"
                placeholder="Enter student name"
              />
            </label>

            <label>
              <span className="text-sm font-medium text-slate-700">Company</span>
              <input
                value={student.company}
                onChange={(event) => updateStudent("company", event.target.value)}
                className="app-input"
                placeholder="Enter company"
              />
            </label>

            <label>
              <span className="text-sm font-medium text-slate-700">
                Last 4 Characters
              </span>
              <input
                value={student.lastFourCharacters}
                onChange={(event) =>
                  updateStudent("lastFourCharacters", event.target.value.slice(0, 4))
                }
                maxLength={4}
                className="app-input uppercase"
                placeholder="A123"
              />
            </label>
          </div>
        </section>
      );
    }

    if (activeStep === "signature") {
      return (
        <section className="app-card">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-navy text-white">
                <Signature size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  Student Signature
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  The signature locks only after saving the record.
                </p>
              </div>
            </div>

            {student.studentSignatureDataUrl ? (
              <button
                type="button"
                onClick={retakeSignature}
                className="app-button-secondary"
              >
                Retake Signature
              </button>
            ) : null}
          </div>

          <div className="relative mt-4 overflow-hidden rounded-lg border border-slate-300 bg-slate-50 p-2">
            <canvas
              ref={signatureCanvasRef}
              width={900}
              height={240}
              onPointerDown={startSignature}
              onPointerMove={drawSignature}
              onPointerUp={endSignature}
              onPointerCancel={endSignature}
              onPointerLeave={endSignature}
              className={`h-48 w-full rounded-md bg-white sm:h-56 ${
                signatureLocked ? "touch-auto cursor-not-allowed" : "touch-none"
              }`}
            />

            {signatureLocked ? (
              <div className="pointer-events-none absolute right-4 top-4 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                Locked
              </div>
            ) : null}
          </div>

          <p
            className={`mt-3 text-sm font-medium ${
              student.studentSignatureDataUrl ? "text-green-700" : "text-slate-500"
            }`}
          >
            {student.studentSignatureDataUrl
              ? signatureLocked
                ? "Signature saved and locked."
                : "Signature captured. It will lock after saving the record."
              : "No signature captured yet."}
          </p>
        </section>
      );
    }

    if (activeStep === "flights") {
      return (
        <section className="app-card">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Flight Entries
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Add each flight through the flight form.
              </p>
            </div>

            <button onClick={openAddFlightModal} className="app-button-primary">
              <Plus size={17} />
              Add Flight
            </button>
          </div>

          {rows.length ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {rows.map((row, index) => (
                <article
                  key={index}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {row.date || "No date"} - {row.location || "No location"}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
                        <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1">
                          <Clock size={13} />
                          {row.startTime || "--:--"}
                        </span>

                        <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1">
                          <MapPin size={13} />
                          {row.uaCategory || "-"}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => openEditFlightModal(index)}
                        className="app-icon-button"
                        aria-label="Edit row"
                      >
                        <Pencil size={15} />
                      </button>

                      <button
                        onClick={() => deleteFlightEntry(index)}
                        className="app-danger-icon-button"
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
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <CheckCircle2 size={28} className="mx-auto text-slate-400" />
              <p className="mt-3 text-sm font-semibold text-slate-800">
                No flight entries yet.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Tap Add Flight to enter the first flight details.
              </p>
            </div>
          )}
        </section>
      );
    }

    return (
      <section className="app-card">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-navy text-white">
            <ShieldCheck size={18} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Review and Save
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Confirm the details before saving the record.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Student
            </p>
            <p className="mt-1 font-semibold text-slate-950">
              {student.studentName || "-"}
            </p>
            <p className="text-sm text-slate-500">{student.company || "-"}</p>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Signature
            </p>
            <p className="mt-1 font-semibold text-slate-950">
              {student.studentSignatureDataUrl ? "Captured" : "Missing"}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Flights
            </p>
            <p className="mt-1 font-semibold text-slate-950">
              {rows.length} entries
            </p>
          </div>
        </div>

        <button onClick={saveRecord} className="app-button-primary mt-5 w-full justify-center sm:w-auto">
          <ShieldCheck size={16} />
          Save Record
        </button>
      </section>
    );
  }

  return (
    <AppShell>
      {saving ? <LoadingOverlay label="Saving flight log..." /> : null}

      <div className="app-page pb-28 md:pb-0">
        <section className="app-card overflow-hidden">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                <FileCheck2 size={14} />
                {activeRecordId ? "Continuing Record" : "New Flight Log"}
              </div>

              <h1 className="mt-3 text-2xl font-semibold text-slate-950">
                {student.studentName || "Flight Log"}
              </h1>

              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Complete the student profile, capture the signature, add flights, and review before saving.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:min-w-[300px]">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xl font-bold text-slate-950">{completedCount}/3</p>
                <p className="text-xs font-medium text-slate-500">Sections ready</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xl font-bold text-slate-950">{rows.length}</p>
                <p className="text-xs font-medium text-slate-500">Flight entries</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-2 xl:hidden">
            {steps.map((step, index) => {
              const isActive = activeStep === step.key;
              const isComplete =
                (step.key === "details" && detailsDone) ||
                (step.key === "signature" && signatureDone) ||
                (step.key === "flights" && flightsDone) ||
                (step.key === "review" && detailsDone && signatureDone && flightsDone);

              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setActiveStep(step.key)}
                  className={`min-w-0 rounded-lg border px-1.5 py-2.5 text-center text-[11px] font-bold sm:px-3 sm:text-sm ${
                    isActive
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-current/10">
                    {isComplete ? <Check size={14} /> : index + 1}
                  </span>
                  <span className="block truncate">{step.title}</span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[240px_minmax(0,1fr)] xl:items-start">
          <aside className="app-card sticky top-6 hidden p-3 xl:block">
            <p className="px-2 pb-3 text-xs font-semibold uppercase text-slate-500">
              Workflow
            </p>

            <div className="space-y-1">
              {steps.map((step, index) => {
                const isActive = activeStep === step.key;
                const isComplete =
                  (step.key === "details" && detailsDone) ||
                  (step.key === "signature" && signatureDone) ||
                  (step.key === "flights" && flightsDone) ||
                  (step.key === "review" && detailsDone && signatureDone && flightsDone);

                return (
                  <button
                    key={step.key}
                    type="button"
                    onClick={() => setActiveStep(step.key)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold transition ${
                      isActive
                        ? "bg-slate-950 text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
                      isActive ? "bg-white/15" : "bg-slate-100"
                    }`}>
                      {isComplete ? <Check size={14} /> : index + 1}
                    </span>
                    {step.title}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
              <button onClick={saveDraft} className="app-button-secondary w-full justify-center">
                <Save size={16} />
                Save Draft
              </button>
              <button onClick={clearDraft} className="app-button-secondary w-full justify-center">
                <RotateCcw size={16} />
                Clear Draft
              </button>
            </div>
          </aside>

          <div className="min-w-0 space-y-5">
            {renderStepContent()}

            <section className="hidden items-center justify-between gap-3 md:flex">
              <div className="flex gap-2 xl:hidden">
                <button onClick={clearDraft} className="app-button-secondary">
                  <RotateCcw size={16} />
                  Clear
                </button>
                <button onClick={saveDraft} className="app-button-secondary">
                  <Save size={16} />
                  Save Draft
                </button>
              </div>

              <div className="ml-auto flex gap-2">
                <button
                  onClick={goBack}
                  disabled={activeStep === "details"}
                  className="app-button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft size={16} />
                  Back
                </button>

                {activeStep === "review" ? (
                  <button onClick={saveRecord} className="app-button-primary">
                    <ShieldCheck size={16} />
                    Save Record
                  </button>
                ) : (
                  <button onClick={goNext} className="app-button-primary">
                    Next
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur md:hidden">
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={goBack}
            disabled={activeStep === "details"}
            className="inline-flex h-11 items-center justify-center gap-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            <ChevronLeft size={15} />
            Back
          </button>

          <button
            onClick={saveDraft}
            className="inline-flex h-11 items-center justify-center gap-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
          >
            <Save size={15} />
            Draft
          </button>

          {activeStep === "review" ? (
            <button
              onClick={saveRecord}
              className="inline-flex h-11 items-center justify-center gap-1 rounded-lg bg-brand-navy text-xs font-semibold text-white"
            >
              <ShieldCheck size={15} />
              Save
            </button>
          ) : (
            <button
              onClick={goNext}
              className="inline-flex h-11 items-center justify-center gap-1 rounded-lg bg-brand-navy text-xs font-semibold text-white"
            >
              Next
              <ChevronRight size={15} />
            </button>
          )}
        </div>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-lg">
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
                className="app-icon-button"
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

            <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white p-5 sm:flex-row sm:justify-end">
              <button onClick={closeFlightModal} className="app-button-secondary">
                Cancel
              </button>

              <button onClick={saveFlightEntry} className="app-button-primary">
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

function normalizeEntryValue(value: string) {
  return String(value || "").trim().toLowerCase();
}

function entryStartMinutes(value: string) {
  const match = String(value || "")
    .trim()
    .match(/^([01]\d|2[0-3]):([0-5]\d)$/);

  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function entryDuplicateKey(row: FlightLogRow) {
  return [
    row.date,
    normalizeEntryValue(row.location),
    row.startTime,
    normalizeEntryValue(row.uaModel),
    normalizeEntryValue(row.batterySn),
  ].join("|");
}

function entriesOverlap(first: FlightLogRow, second: FlightLogRow) {
  const firstStart = entryStartMinutes(first.startTime);
  const secondStart = entryStartMinutes(second.startTime);
  const firstDuration = Number(first.duration);
  const secondDuration = Number(second.duration);

  if (
    firstStart === null ||
    secondStart === null ||
    !Number.isInteger(firstDuration) ||
    !Number.isInteger(secondDuration)
  ) {
    return false;
  }

  return (
    firstStart < secondStart + secondDuration &&
    secondStart < firstStart + firstDuration
  );
}

function validateFlightEntry(
  row: FlightLogRow,
  masterData: MasterData | null,
  existingRows: FlightLogRow[],
  editingIndex: number | null
) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const duration = Number(row.duration);
  const today = new Date();
  const localToday = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  if (!row.date) errors.push("Date is required.");
  else if (row.date > localToday) {
    errors.push("Future flight dates are not allowed.");
  }

  if (entryStartMinutes(row.startTime) === null) {
    errors.push("Start time must use HH:MM in 24-hour format.");
  }

  if (!Number.isInteger(duration) || duration <= 0 || duration > 1440) {
    errors.push("Duration must be a whole number from 1 to 1440 minutes.");
  }

  if (!row.location.trim()) errors.push("Location is required.");
  if (!row.uaCategory.trim()) errors.push("UA Category is required.");
  if (!row.pilotInCommand.trim()) errors.push("Pilot in Command is required.");
  if (!row.instructorInCommand.trim()) {
    errors.push("AFE / Instructor is required.");
  }

  const activeModels = (masterData?.uaModels || []).map(normalizeEntryValue);
  const activeBatteries = (masterData?.batterySerialNumbers || []).map(
    normalizeEntryValue
  );

  if (!activeModels.includes(normalizeEntryValue(row.uaModel))) {
    errors.push("Select an active UA Model from Master Data.");
  }
  if (!activeBatteries.includes(normalizeEntryValue(row.batterySn))) {
    errors.push("Select an active Battery S/N from Master Data.");
  }

  existingRows.forEach((existingRow, index) => {
    if (editingIndex === index) return;

    if (entryDuplicateKey(existingRow) === entryDuplicateKey(row)) {
      errors.push("This flight entry already exists in the current record.");
    }

    if (
      existingRow.date === row.date &&
      normalizeEntryValue(existingRow.batterySn) ===
        normalizeEntryValue(row.batterySn) &&
      entriesOverlap(existingRow, row)
    ) {
      warnings.push(
        `Battery ${row.batterySn} overlaps another flight in this record.`
      );
    }
  });

  return {
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
  };
}
