"use client";

import {
  CheckCheck,
  ChevronRight,
  ClipboardCheck,
  Download,
  Edit3,
  Eye,
  Loader2,
  Plus,
  Save,
  Search,
  Settings2,
  Trash2,
  Upload,
  UserRound,
  X
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { AppShell } from "@/components/app-shell";
import { useAppMessage } from "@/components/message-provider";
import { getSecureSession } from "@/lib/auth-api";
import {
  deleteStaffTrainingRecord,
  fetchStaffTrainingDescriptions,
  fetchStaffTrainingRecord,
  fetchStaffTrainingRecords,
  saveStaffTrainingDescriptions,
  saveStaffTrainingRecord
} from "@/lib/staff-training-api";
import {
  createStaffTrainingEntries,
  STAFF_TRAINING_LABELS,
  STAFF_TRAINING_TYPES,
  type StaffTrainingDescription,
  type StaffTrainingEntry,
  type StaffTrainingItemStatus,
  type StaffTrainingRecord,
  type StaffTrainingRecordSummary,
  type StaffTrainingType
} from "@/lib/staff-training";
import {
  createStaffTrainingPdf,
  staffTrainingPdfFileName
} from "@/lib/staff-training-pdf";

type PageMode = "checklist" | "records" | "descriptions";

const inputClass =
  "mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100 md:h-11 md:text-sm";

const statusOptions: Array<{
  value: StaffTrainingItemStatus;
  label: string;
}> = [
  { value: "", label: "Select status" },
  { value: "not_completed", label: "Not Completed" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" }
];

function emptyRecord(
  descriptions: StaffTrainingDescription[],
  name = "",
  email = ""
): StaffTrainingRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    staffName: name,
    staffEmail: email,
    designation: "",
    headOfTrainingName: "Gerald Lim",
    signatureDataUrl: "",
    items: createStaffTrainingEntries(descriptions),
    createdAt: now,
    updatedAt: now
  };
}

function statusColor(status: StaffTrainingItemStatus) {
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "in_progress") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-slate-200 bg-slate-100 text-slate-600";
}

export default function StaffTrainingPage() {
  const message = useAppMessage();
  const session = getSecureSession();
  const isAdmin = session?.role === "admin";
  const [mode, setMode] = useState<PageMode>("checklist");
  const [activeType, setActiveType] =
    useState<StaffTrainingType>("induction");
  const [descriptions, setDescriptions] = useState<
    StaffTrainingDescription[]
  >([]);
  const [records, setRecords] = useState<StaffTrainingRecordSummary[]>([]);
  const [record, setRecord] = useState<StaffTrainingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [search, setSearch] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDescriptionType, setNewDescriptionType] =
    useState<StaffTrainingType>("induction");

  async function loadPage() {
    setLoading(true);
    try {
      const [nextDescriptions, nextRecords] = await Promise.all([
        fetchStaffTrainingDescriptions(),
        fetchStaffTrainingRecords()
      ]);
      setDescriptions(nextDescriptions);
      setRecords(nextRecords);
      setRecord((current) =>
        current ||
        emptyRecord(
          nextDescriptions,
          session?.name || "",
          session?.email || ""
        )
      );
    } catch (error) {
      message.error(
        "Staff training could not be loaded",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
    // The secure session is stable for this page visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleItems = useMemo(
    () =>
      (record?.items || [])
        .filter((item) => item.trainingType === activeType)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [activeType, record]
  );

  const progress = useMemo(() => {
    const items = record?.items || [];
    const completed = items.filter(
      (item) => item.status === "completed"
    ).length;
    return {
      completed,
      total: items.length,
      percentage: items.length ? Math.round((completed / items.length) * 100) : 0
    };
  }, [record]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return records;
    return records.filter((item) =>
      [item.staffName, item.staffEmail, item.designation]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [records, search]);

  function updateRecord(patch: Partial<StaffTrainingRecord>) {
    setRecord((current) => (current ? { ...current, ...patch } : current));
  }

  function updateItem(itemId: string, patch: Partial<StaffTrainingEntry>) {
    setRecord((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item) =>
          item.itemId === itemId ? { ...item, ...patch } : item
        )
      };
    });
  }

  function changeStatus(item: StaffTrainingEntry, status: StaffTrainingItemStatus) {
    updateItem(item.itemId, {
      status,
      dateCompleted:
        status === "completed"
          ? item.dateCompleted || new Date().toISOString().slice(0, 10)
          : ""
    });
  }

  async function markSectionCompleted() {
    if (!record) return;

    const sectionLabel = STAFF_TRAINING_LABELS[activeType];
    const confirmed = await message.confirm({
      title: `Complete ${sectionLabel}?`,
      message:
        "Every item in this section will be marked Completed. Blank completion dates will use today's date.",
      confirmLabel: "Mark all completed"
    });

    if (!confirmed) return;

    const today = new Date().toISOString().slice(0, 10);
    setRecord((current) => {
      if (!current) return current;

      return {
        ...current,
        items: current.items.map((item) =>
          item.trainingType === activeType
            ? {
                ...item,
                status: "completed",
                dateCompleted: item.dateCompleted || today
              }
            : item
        )
      };
    });

    message.success(
      `${sectionLabel} completed`,
      "Review the dates and remarks, then save the checklist."
    );
  }

  function startNewRecord() {
    setRecord(
      emptyRecord(
        descriptions,
        session?.name || "",
        session?.email || ""
      )
    );
    setActiveType("induction");
    setMode("checklist");
  }

  async function openRecord(recordId: string) {
    setWorking("Opening staff training record...");
    try {
      const saved = await fetchStaffTrainingRecord(recordId);
      setRecord({
        ...saved,
        items: createStaffTrainingEntries(descriptions, saved.items)
      });
      setActiveType("induction");
      setMode("checklist");
    } catch (error) {
      message.error(
        "Record could not be opened",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking("");
    }
  }

  function validateRecord(requireSignature = false) {
    if (!record?.staffName.trim()) return "Enter the staff name.";
    if (!record.staffEmail.trim()) return "Enter the staff email.";
    if (!record.designation.trim()) return "Enter the staff designation.";
    if (!record.headOfTrainingName.trim()) {
      return "Enter the Head of Training name.";
    }
    const completedWithoutDate = record.items.find(
      (item) => item.status === "completed" && !item.dateCompleted
    );
    if (completedWithoutDate) {
      return `Add the completion date for: ${completedWithoutDate.description}`;
    }
    if (requireSignature && !record.signatureDataUrl) {
      return "Upload the Head of Training signature before generating the report.";
    }
    return "";
  }

  async function saveRecord() {
    if (!record || working) return;
    const error = validateRecord();
    if (error) {
      message.warning("Complete the required information", error);
      return;
    }
    setWorking("Saving staff training record...");
    try {
      const saved = await saveStaffTrainingRecord({
        ...record,
        updatedAt: new Date().toISOString()
      });
      setRecord(saved);
      setRecords(await fetchStaffTrainingRecords());
      message.success(
        "Staff training saved",
        `${saved.staffName}'s checklist is now stored in Google Sheets.`
      );
    } catch (errorValue) {
      message.error(
        "Staff training was not saved",
        errorValue instanceof Error ? errorValue.message : "Please try again."
      );
    } finally {
      setWorking("");
    }
  }

  async function removeRecord(summary: StaffTrainingRecordSummary) {
    const confirmed = await message.confirm({
      title: "Delete staff training record?",
      message: `This permanently deletes ${summary.staffName}'s checklist and its line entries.`,
      confirmLabel: "Delete record",
      variant: "danger"
    });
    if (!confirmed) return;
    setWorking("Deleting staff training record...");
    try {
      await deleteStaffTrainingRecord(summary.id);
      setRecords((current) => current.filter((item) => item.id !== summary.id));
      if (record?.id === summary.id) startNewRecord();
      message.success("Record deleted");
    } catch (error) {
      message.error(
        "Record was not deleted",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking("");
    }
  }

  async function handleSignature(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      message.warning("Choose an image", "Use a PNG, JPG, or HEIC signature image.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      message.warning("Signature image is too large", "Choose an image smaller than 3 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updateRecord({ signatureDataUrl: String(reader.result || "") });
    reader.onerror = () => message.error("Signature could not be read");
    reader.readAsDataURL(file);
  }

  async function previewPdf(download = false) {
    if (!record) return;
    const error = validateRecord(true);
    if (error) {
      message.warning("Report is not ready", error);
      return;
    }
    const previewWindow = download ? null : window.open("", "_blank");
    setWorking(download ? "Preparing PDF download..." : "Preparing PDF preview...");
    try {
      const doc = await createStaffTrainingPdf(record);
      if (download) {
        doc.save(staffTrainingPdfFileName(record));
      } else {
        const url = URL.createObjectURL(doc.output("blob"));
        if (previewWindow) previewWindow.location.href = url;
        else window.open(url, "_blank");
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (errorValue) {
      previewWindow?.close();
      message.error(
        "PDF could not be generated",
        errorValue instanceof Error ? errorValue.message : "Please try again."
      );
    } finally {
      setWorking("");
    }
  }

  function addDescription() {
    const value = newDescription.trim();
    if (!value) return;
    const duplicate = descriptions.some(
      (item) =>
        item.trainingType === newDescriptionType &&
        item.description.toLowerCase() === value.toLowerCase()
    );
    if (duplicate) {
      message.warning("Duplicate description", "This description already exists in the section.");
      return;
    }
    const sortOrder =
      Math.max(
        0,
        ...descriptions
          .filter((item) => item.trainingType === newDescriptionType)
          .map((item) => item.sortOrder)
      ) + 1;
    setDescriptions((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        trainingType: newDescriptionType,
        description: value,
        sortOrder,
        status: "active"
      }
    ]);
    setNewDescription("");
  }

  async function saveDescriptions() {
    setWorking("Saving training descriptions...");
    try {
      const saved = await saveStaffTrainingDescriptions(descriptions);
      setDescriptions(saved);
      setRecord((current) =>
        current
          ? { ...current, items: createStaffTrainingEntries(saved, current.items) }
          : current
      );
      message.success("Descriptions updated", "The checklist setup is now active for all users.");
    } catch (error) {
      message.error(
        "Descriptions were not saved",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking("");
    }
  }

  async function removeDescription(item: StaffTrainingDescription) {
    const confirmed = await message.confirm({
      title: "Delete training description?",
      message:
        "It will be removed from new checklists. Existing saved records will keep their historical description.",
      confirmLabel: "Delete description",
      variant: "danger"
    });

    if (confirmed) {
      setDescriptions((current) =>
        current.filter((entry) => entry.id !== item.id)
      );
    }
  }

  if (loading || !record) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-sky-700" />
            <span className="text-sm font-semibold text-slate-700">Loading staff training...</span>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-sky-700">
              <ClipboardCheck className="h-4 w-4" /> ADA-UATO-3-1B
            </div>
            <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">Staff Internal Training</h1>
            <p className="mt-1 text-sm text-slate-600">Complete, maintain, and report staff training checklists.</p>
          </div>
          <button
            type="button"
            onClick={startNewRecord}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 lg:h-11"
          >
            <Plus className="h-4 w-4" /> New checklist
          </button>
        </header>

        <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-1 sm:flex sm:w-fit">
          <ModeButton active={mode === "checklist"} onClick={() => setMode("checklist")} icon={ClipboardCheck} label="Checklist" />
          <ModeButton active={mode === "records"} onClick={() => setMode("records")} icon={UserRound} label="Records" />
          {isAdmin ? (
            <ModeButton active={mode === "descriptions"} onClick={() => setMode("descriptions")} icon={Settings2} label="Descriptions" />
          ) : null}
        </div>

        {mode === "checklist" ? (
          <>
            <section className="grid gap-4 border-b border-slate-200 pb-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Staff name">
                  <input className={inputClass} value={record.staffName} onChange={(event) => updateRecord({ staffName: event.target.value })} />
                </Field>
                <Field label="Staff email">
                  <input type="email" className={inputClass} value={record.staffEmail} onChange={(event) => updateRecord({ staffEmail: event.target.value })} />
                </Field>
                <Field label="Designation">
                  <input className={inputClass} value={record.designation} onChange={(event) => updateRecord({ designation: event.target.value })} placeholder="e.g. UAPL Trainer" />
                </Field>
              </div>
              <div className="rounded-lg bg-slate-950 p-4 text-white">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">Overall progress</span>
                  <span>{progress.completed}/{progress.total}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full bg-sky-400 transition-all" style={{ width: `${progress.percentage}%` }} />
                </div>
                <p className="mt-2 text-xs text-slate-300">{progress.percentage}% completed</p>
              </div>
            </section>

            <div className="grid grid-cols-3 gap-2">
              {STAFF_TRAINING_TYPES.map((type) => {
                const count = record.items.filter((item) => item.trainingType === type && item.status === "completed").length;
                const total = record.items.filter((item) => item.trainingType === type).length;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setActiveType(type)}
                    className={`min-w-0 rounded-lg border px-3 py-3 text-left transition ${activeType === type ? "border-sky-700 bg-sky-50 text-sky-950 ring-1 ring-sky-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                  >
                    <span className="block truncate text-xs font-bold sm:text-sm">{STAFF_TRAINING_LABELS[type].replace(" Training", "")}</span>
                    <span className="mt-1 block text-[11px]">{count} of {total}</span>
                  </button>
                );
              })}
            </div>

            <section>
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">{STAFF_TRAINING_LABELS[activeType]}</h2>
                  <p className="text-sm text-slate-500">Update status, completion date, and remarks for each requirement.</p>
                </div>
                <button
                  type="button"
                  onClick={() => void markSectionCompleted()}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 sm:w-auto"
                >
                  <CheckCheck className="h-4 w-4" />
                  Mark section completed
                </button>
              </div>

              <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white xl:block">
                <div className="grid grid-cols-[48px_minmax(220px,1.3fr)_150px_150px_minmax(180px,1fr)] bg-slate-100 px-4 py-3 text-xs font-bold uppercase text-slate-600">
                  <span>S/N</span><span>Description</span><span>Status</span><span>Date completed</span><span>Remarks</span>
                </div>
                {visibleItems.map((item, index) => (
                  <div key={item.itemId} className="grid grid-cols-[48px_minmax(220px,1.3fr)_150px_150px_minmax(180px,1fr)] items-center gap-0 border-t border-slate-200 px-4 py-3">
                    <span className="text-sm font-bold text-slate-500">{index + 1}</span>
                    <p className="pr-4 text-sm font-medium leading-5 text-slate-900">{item.description}</p>
                    <select className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm" value={item.status} onChange={(event) => changeStatus(item, event.target.value as StaffTrainingItemStatus)}>
                      {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <input type="date" className="mx-3 h-10 rounded-lg border border-slate-300 px-2 text-sm disabled:bg-slate-100" value={item.dateCompleted} disabled={item.status !== "completed"} onChange={(event) => updateItem(item.itemId, { dateCompleted: event.target.value })} />
                    <input className="h-10 rounded-lg border border-slate-300 px-3 text-sm" value={item.remarks} onChange={(event) => updateItem(item.itemId, { remarks: event.target.value })} placeholder="Optional remarks" />
                  </div>
                ))}
              </div>

              <div className="space-y-3 xl:hidden">
                {visibleItems.map((item, index) => (
                  <article key={item.itemId} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-5 text-slate-950">{item.description}</p>
                        <span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[11px] font-bold ${statusColor(item.status)}`}>{statusOptions.find((option) => option.value === item.status)?.label}</span>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <Field label="Status">
                        <select className={inputClass} value={item.status} onChange={(event) => changeStatus(item, event.target.value as StaffTrainingItemStatus)}>
                          {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </Field>
                      <Field label="Date completed">
                        <input type="date" className={`${inputClass} disabled:bg-slate-100`} value={item.dateCompleted} disabled={item.status !== "completed"} onChange={(event) => updateItem(item.itemId, { dateCompleted: event.target.value })} />
                      </Field>
                    </div>
                    <Field label="Remarks">
                      <textarea className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 p-3 text-base outline-none focus:border-sky-600 md:text-sm" value={item.remarks} onChange={(event) => updateItem(item.itemId, { remarks: event.target.value })} placeholder="Optional remarks" />
                    </Field>
                  </article>
                ))}
              </div>
            </section>

            <section className="grid gap-5 border-t border-slate-200 pt-5 lg:grid-cols-2">
              <Field label="Head of Training name">
                <input className={inputClass} value={record.headOfTrainingName} onChange={(event) => updateRecord({ headOfTrainingName: event.target.value })} />
              </Field>
              <div>
                <label className="text-sm font-semibold text-slate-800">Head of Training signature</label>
                {record.signatureDataUrl ? (
                  <div className="mt-2 flex min-h-28 items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <img src={record.signatureDataUrl} alt="Uploaded signature" className="max-h-20 max-w-[70%] object-contain" />
                    <button type="button" onClick={() => updateRecord({ signatureDataUrl: "" })} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600" aria-label="Remove signature"><X className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <label className="mt-2 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-4 text-center hover:border-sky-500 hover:bg-sky-50">
                    <Upload className="h-5 w-5 text-sky-700" />
                    <span className="mt-2 text-sm font-semibold text-slate-800">Upload signature image</span>
                    <span className="mt-1 text-xs text-slate-500">PNG or JPG, maximum 3 MB</span>
                    <input type="file" accept="image/*" className="sr-only" onChange={(event) => void handleSignature(event.target.files?.[0])} />
                  </label>
                )}
              </div>
            </section>

            <footer className="sticky bottom-0 z-20 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:-mx-7 md:px-7 lg:static lg:mx-0 lg:flex lg:justify-end lg:border-0 lg:bg-transparent lg:px-0">
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button type="button" onClick={() => void previewPdf(false)} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Eye className="h-4 w-4" /> Preview</button>
                <button type="button" onClick={() => void previewPdf(true)} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /> PDF</button>
                <button type="button" onClick={() => void saveRecord()} className="col-span-2 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-sky-700 px-5 text-sm font-semibold text-white hover:bg-sky-800"><Save className="h-4 w-4" /> Save checklist</button>
              </div>
            </footer>
          </>
        ) : null}

        {mode === "records" ? (
          <section>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-xl font-bold text-slate-950">Saved staff records</h2><p className="text-sm text-slate-500">Open a checklist to continue updating it.</p></div>
              <div className="relative w-full sm:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} mt-0 pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff" /></div>
            </div>
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {filteredRecords.map((item) => (
                <article key={item.id} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700"><UserRound className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold text-slate-950">{item.staffName}</p><p className="truncate text-sm text-slate-500">{item.designation || item.staffEmail}</p><p className="mt-1 text-xs font-semibold text-emerald-700">{item.completedCount} of {item.totalCount} completed</p></div>
                  <div className="flex justify-end gap-2">
                    <IconButton label="Open record" onClick={() => void openRecord(item.id)} icon={ChevronRight} />
                    <IconButton label="Delete record" onClick={() => void removeRecord(item)} icon={Trash2} danger />
                  </div>
                </article>
              ))}
              {!filteredRecords.length ? <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 xl:col-span-2">No staff training records found.</div> : null}
            </div>
          </section>
        ) : null}

        {mode === "descriptions" && isAdmin ? (
          <section>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div><h2 className="text-xl font-bold text-slate-950">Checklist descriptions</h2><p className="text-sm text-slate-500">Changes apply to new checklists and keep saved descriptions as report history.</p></div>
              <button type="button" onClick={() => void saveDescriptions()} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white"><Save className="h-4 w-4" /> Save descriptions</button>
            </div>
            <div className="mt-5 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[200px_minmax(0,1fr)_auto]">
              <select className={inputClass} value={newDescriptionType} onChange={(event) => setNewDescriptionType(event.target.value as StaffTrainingType)}>{STAFF_TRAINING_TYPES.map((type) => <option key={type} value={type}>{STAFF_TRAINING_LABELS[type]}</option>)}</select>
              <input className={inputClass} value={newDescription} onChange={(event) => setNewDescription(event.target.value)} placeholder="New checklist description" onKeyDown={(event) => { if (event.key === "Enter") addDescription(); }} />
              <button type="button" onClick={addDescription} className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white md:h-11"><Plus className="h-4 w-4" /> Add</button>
            </div>
            <div className="mt-5 space-y-6">
              {STAFF_TRAINING_TYPES.map((type) => (
                <div key={type}>
                  <h3 className="mb-2 text-sm font-bold text-slate-950">{STAFF_TRAINING_LABELS[type]}</h3>
                  <div className="space-y-2">
                    {descriptions.filter((item) => item.trainingType === type).sort((a, b) => a.sortOrder - b.sortOrder).map((item, index) => (
                      <div key={item.id} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[40px_minmax(0,1fr)_120px_auto] sm:items-center">
                        <span className="text-sm font-bold text-slate-400">{index + 1}</span>
                        <input className="h-11 rounded-lg border border-slate-300 px-3 text-sm" value={item.description} onChange={(event) => setDescriptions((current) => current.map((entry) => entry.id === item.id ? { ...entry, description: event.target.value } : entry))} />
                        <button type="button" onClick={() => setDescriptions((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: entry.status === "active" ? "inactive" : "active" } : entry))} className={`h-10 rounded-lg border px-3 text-xs font-bold ${item.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}>{item.status === "active" ? "Active" : "Inactive"}</button>
                        <IconButton label="Delete description" icon={Trash2} danger onClick={() => void removeDescription(item)} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {working ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-sm items-center gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-2xl"><Loader2 className="h-5 w-5 animate-spin text-sky-700" /><div><p className="text-sm font-semibold text-slate-950">Please wait</p><p className="text-sm text-slate-500">{working}</p></div></div>
        </div>
      ) : null}
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-semibold text-slate-800">{label}{children}</label>;
}

function ModeButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof ClipboardCheck; label: string }) {
  return <button type="button" onClick={onClick} className={`inline-flex h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition ${active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}><Icon className="h-4 w-4" />{label}</button>;
}

function IconButton({ label, onClick, icon: Icon, danger = false }: { label: string; onClick: () => void; icon: typeof Edit3; danger?: boolean }) {
  return <button type="button" onClick={onClick} title={label} aria-label={label} className={`flex h-10 w-10 items-center justify-center rounded-lg border transition ${danger ? "border-rose-200 text-rose-600 hover:bg-rose-50" : "border-slate-200 text-slate-600 hover:bg-slate-100"}`}><Icon className="h-4 w-4" /></button>;
}
