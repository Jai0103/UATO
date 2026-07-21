"use client";

import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  Eye,
  Loader2,
  Plus,
  Printer,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Wrench,
  X
} from "lucide-react";
import { usePathname } from "next/navigation";
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
  deleteUaMaintenanceRecord,
  fetchUaMaintenanceMasterData,
  fetchUaMaintenanceRecord,
  fetchUaMaintenanceRecordsPage,
  saveUaMaintenanceMasterData,
  saveUaMaintenanceRecord,
  type UaMaintenanceRecordsPage
} from "@/lib/ua-maintenance-api";
import {
  createUaMaintenanceEntries,
  emptyUaMaintenanceMasterData,
  type UaMaintenanceEntry,
  type UaMaintenanceMasterData,
  type UaMaintenanceMasterItem,
  type UaMaintenanceMasterSection,
  type UaMaintenanceRecord,
  type UaMaintenanceRecordSummary,
  type UaMaintenanceStatus
} from "@/lib/ua-maintenance";
import {
  createUaMaintenancePdf,
  uaMaintenancePdfFileName
} from "@/lib/ua-maintenance-pdf";

type PageMode = "checklist" | "records" | "masterData";

const inputClass =
  "mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-100 md:h-11 md:text-sm";

const statusOptions: Array<{ value: UaMaintenanceStatus; label: string }> = [
  { value: "", label: "Select status" },
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "na", label: "N/A" }
];

const monthOptions = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const sectionLabels: Record<UaMaintenanceMasterSection, string> = {
  uaModels: "UA Aircraft",
  uaIds: "UA ID No.",
  descriptions: "Checklist Description"
};

function createEmptyRecord(
  masterData: UaMaintenanceMasterData,
  checkerName = ""
): UaMaintenanceRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    uaModel: "",
    uaId: "",
    inspectionDate: now.slice(0, 10),
    recommendation: "",
    checkedByName: checkerName,
    checkedByIdNo: "",
    signatureDataUrl: "",
    items: createUaMaintenanceEntries(masterData.descriptions),
    createdAt: now,
    updatedAt: now
  };
}

function statusStyle(status: UaMaintenanceStatus) {
  if (status === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "fail") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "na") return "border-slate-300 bg-slate-100 text-slate-600";
  return "border-slate-200 bg-white text-slate-500";
}

export default function UaMaintenancePage() {
  const pathname = usePathname();
  const message = useAppMessage();
  const session = getSecureSession();
  const routeMode: PageMode = pathname.includes("/master-data")
    ? "masterData"
    : pathname.includes("/records")
      ? "records"
      : "checklist";
  const [mode, setMode] = useState<PageMode>(routeMode);
  const [masterData, setMasterData] = useState<UaMaintenanceMasterData>(
    emptyUaMaintenanceMasterData()
  );
  const [record, setRecord] = useState<UaMaintenanceRecord | null>(null);
  const [records, setRecords] = useState<UaMaintenanceRecordSummary[]>([]);
  const [recordsPage, setRecordsPage] = useState<UaMaintenanceRecordsPage>({
    records: [], page: 1, pageSize: 10, totalRecords: 0, totalPages: 1,
    hasPreviousPage: false, hasNextPage: false
  });
  const [viewingRecord, setViewingRecord] = useState<UaMaintenanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [working, setWorking] = useState("");
  const [search, setSearch] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [masterSection, setMasterSection] =
    useState<UaMaintenanceMasterSection>("uaModels");
  const [newMasterValue, setNewMasterValue] = useState("");
  const [newMasterUaId, setNewMasterUaId] = useState("");

  const yearOptions = useMemo(() => {
    const year = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, index) => year - index);
  }, []);

  async function loadPage() {
    setLoading(true);
    try {
      const [nextMasterData, page] = await Promise.all([
        fetchUaMaintenanceMasterData(),
        fetchUaMaintenanceRecordsPage({ page: 1, pageSize: 10 })
      ]);
      setMasterData(nextMasterData);
      setRecords(page.records);
      setRecordsPage(page);
      setRecord((current) =>
        current || createEmptyRecord(nextMasterData, session?.name || "")
      );
    } catch (error) {
      message.error(
        "UA Maintenance could not be loaded",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => setMode(routeMode), [routeMode]);

  useEffect(() => {
    if (loading || routeMode !== "records") return;
    const timer = window.setTimeout(() => {
      void loadRecordsPage(1, search, selectedYear, selectedMonth);
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, selectedYear, selectedMonth, routeMode, loading]);

  useEffect(() => {
    if (!viewingRecord) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [viewingRecord]);

  async function loadRecordsPage(
    page: number,
    query = search,
    year = selectedYear,
    month = selectedMonth
  ) {
    setRecordsLoading(true);
    try {
      const result = await fetchUaMaintenanceRecordsPage({
        page, pageSize: 10, query, year, month
      });
      setRecords(result.records);
      setRecordsPage(result);
    } catch (error) {
      message.error(
        "Maintenance records could not be loaded",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setRecordsLoading(false);
    }
  }

  function updateRecord(patch: Partial<UaMaintenanceRecord>) {
    setRecord((current) => current ? { ...current, ...patch } : current);
  }

  function updateItem(itemId: string, patch: Partial<UaMaintenanceEntry>) {
    setRecord((current) => current ? {
      ...current,
      items: current.items.map((item) =>
        item.itemId === itemId ? { ...item, ...patch } : item
      )
    } : current);
  }

  function startNewRecord() {
    setRecord(createEmptyRecord(masterData, session?.name || ""));
    setMode("checklist");
  }

  function validateRecord(requireSignature = false) {
    if (!record?.uaModel) return "Select the UA Brand / Model.";
    if (!record.uaId) return "Select the UA ID No.";
    if (!record.inspectionDate) return "Enter the maintenance date.";
    if (!record.checkedByName.trim()) return "Enter the checker name.";
    if (!record.checkedByIdNo.trim()) return "Enter the checker ID number.";
    if (requireSignature && !record.signatureDataUrl) {
      return "Upload the checker signature before generating the report.";
    }
    return "";
  }

  async function saveRecord() {
    if (!record || working) return;
    const validation = validateRecord();
    if (validation) {
      message.warning("Complete the required information", validation);
      return;
    }
    setWorking("Saving UA Maintenance Check...");
    try {
      const saved = await saveUaMaintenanceRecord({
        ...record,
        updatedAt: new Date().toISOString()
      });
      setRecord(saved);
      await loadRecordsPage(recordsPage.page, search, selectedYear, selectedMonth);
      message.success("UA Maintenance Check saved");
    } catch (error) {
      message.error(
        "Maintenance check was not saved",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking("");
    }
  }

  async function loadRecord(recordId: string) {
    setWorking("Loading UA Maintenance Check...");
    try {
      return await fetchUaMaintenanceRecord(recordId);
    } catch (error) {
      message.error(
        "Maintenance record could not be opened",
        error instanceof Error ? error.message : "Please try again."
      );
      return null;
    } finally {
      setWorking("");
    }
  }

  async function editRecord(recordId: string) {
    const saved = await loadRecord(recordId);
    if (!saved) return;
    setRecord({
      ...saved,
      items: createUaMaintenanceEntries(masterData.descriptions, saved.items)
    });
    setMode("checklist");
  }

  async function duplicateRecord(recordId: string) {
    const saved = await loadRecord(recordId);
    if (!saved) return;

    const now = new Date().toISOString();
    setRecord({
      ...saved,
      id: crypto.randomUUID(),
      inspectionDate: now.slice(0, 10),
      items: createUaMaintenanceEntries(masterData.descriptions, saved.items),
      createdAt: now,
      updatedAt: now
    });
    setMode("checklist");
    message.success("Maintenance check duplicated");
  }

  async function viewRecord(recordId: string) {
    const saved = await loadRecord(recordId);
    if (saved) setViewingRecord(saved);
  }

  async function removeRecord(summary: UaMaintenanceRecordSummary) {
    const confirmed = await message.confirm({
      title: "Delete UA Maintenance Check?",
      message: `This permanently deletes ${summary.uaModel} / ${summary.uaId}.`,
      confirmLabel: "Delete record",
      variant: "danger"
    });
    if (!confirmed) return;
    setWorking("Deleting UA Maintenance Check...");
    try {
      await deleteUaMaintenanceRecord(summary.id);
      const nextPage = records.length === 1 && recordsPage.page > 1
        ? recordsPage.page - 1
        : recordsPage.page;
      await loadRecordsPage(nextPage, search, selectedYear, selectedMonth);
      message.success("Maintenance record deleted");
    } catch (error) {
      message.error(
        "Maintenance record was not deleted",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking("");
    }
  }

  async function preparePdf(target: UaMaintenanceRecord, action: "preview" | "download" | "print") {
    if (!target.signatureDataUrl) {
      message.warning("Report is not ready", "Upload the checker signature first.");
      return;
    }
    const previewWindow = action === "download" ? null : window.open("", "_blank");
    setWorking(action === "print" ? "Preparing print view..." : "Preparing PDF...");
    try {
      const doc = await createUaMaintenancePdf(target);
      if (action === "download") {
        doc.save(uaMaintenancePdfFileName(target));
      } else {
        if (action === "print") doc.autoPrint();
        const url = URL.createObjectURL(doc.output("blob"));
        if (previewWindow) previewWindow.location.href = url;
        else window.open(url, "_blank");
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (error) {
      previewWindow?.close();
      message.error(
        "Maintenance PDF could not be generated",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking("");
    }
  }

  async function downloadRecord(recordId: string) {
    setWorking("Preparing maintenance PDF...");
    try {
      const saved = await fetchUaMaintenanceRecord(recordId);
      if (!saved.signatureDataUrl) {
        message.warning("Report is not ready", "Upload the checker signature first.");
        return;
      }
      const doc = await createUaMaintenancePdf(saved);
      doc.save(uaMaintenancePdfFileName(saved));
    } catch (error) {
      message.error(
        "Maintenance PDF could not be downloaded",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking("");
    }
  }

  async function handleSignature(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 3 * 1024 * 1024) {
      message.warning("Invalid signature image", "Use a PNG or JPG smaller than 3 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updateRecord({ signatureDataUrl: String(reader.result || "") });
    reader.onerror = () => message.error("Signature image could not be read");
    reader.readAsDataURL(file);
  }

  function addMasterItem() {
    const value = newMasterValue.trim();
    const linkedUaId = newMasterUaId.trim();
    if (!value) return;
    if (masterSection === "uaModels" && !linkedUaId) {
      message.warning("UA ID No. is required", "Enter the UA ID linked to this Brand / Model.");
      return;
    }
    if (masterData[masterSection].some((item) =>
      item.value.toLowerCase() === value.toLowerCase()
    )) {
      message.warning("Duplicate value", "This value already exists in the selected section.");
      return;
    }
    if (
      masterSection === "uaModels" &&
      masterData.uaModels.some(
        (item) => (item.linkedUaId || "").toLowerCase() === linkedUaId.toLowerCase()
      )
    ) {
      message.warning("Duplicate UA ID No.", "This UA ID is already linked to another aircraft.");
      return;
    }
    const sortOrder = Math.max(
      0,
      ...masterData[masterSection].map((item) => item.sortOrder)
    ) + 1;
    setMasterData((current) => ({
      ...current,
      [masterSection]: [
        ...current[masterSection],
        {
          id: crypto.randomUUID(),
          value,
          linkedUaId: masterSection === "uaModels" ? linkedUaId : "",
          sortOrder,
          status: "active"
        }
      ]
    }));
    setNewMasterValue("");
    setNewMasterUaId("");
  }

  function updateMasterItem(
    section: UaMaintenanceMasterSection,
    id: string,
    patch: Partial<UaMaintenanceMasterItem>
  ) {
    setMasterData((current) => ({
      ...current,
      [section]: current[section].map((item) =>
        item.id === id ? { ...item, ...patch } : item
      )
    }));
  }

  async function removeMasterItem(
    section: UaMaintenanceMasterSection,
    item: UaMaintenanceMasterItem
  ) {
    const confirmed = await message.confirm({
      title: "Delete maintenance master data?",
      message: "Existing records keep their saved value, but it will be removed from new checks.",
      confirmLabel: "Delete value",
      variant: "danger"
    });
    if (confirmed) {
      setMasterData((current) => ({
        ...current,
        [section]: current[section].filter((entry) => entry.id !== item.id)
      }));
    }
  }

  async function saveMasterData() {
    setWorking("Saving UA Maintenance master data...");
    try {
      const saved = await saveUaMaintenanceMasterData(masterData);
      setMasterData(saved);
      setRecord((current) => current ? {
        ...current,
        items: createUaMaintenanceEntries(saved.descriptions, current.items)
      } : current);
      message.success("UA Maintenance master data saved");
    } catch (error) {
      message.error(
        "Master data was not saved",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking("");
    }
  }

  const activeModels = masterData.uaModels.filter((item) => item.status === "active");
  const resultSummary = record
    ? record.items.reduce(
        (summary, item) => {
          if (item.status === "pass") summary.pass += 1;
          if (item.status === "fail") summary.fail += 1;
          if (item.status === "na") summary.na += 1;
          return summary;
        },
        { pass: 0, fail: 0, na: 0 }
      )
    : { pass: 0, fail: 0, na: 0 };

  if (loading || !record) {
    return <AppShell><div className="flex min-h-[60vh] items-center justify-center"><div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-lg"><Loader2 className="h-5 w-5 animate-spin text-sky-700" /><span className="text-sm font-semibold text-slate-700">Loading UA Maintenance...</span></div></div></AppShell>;
  }

  return (
    <AppShell>
      <div className="app-page mx-auto max-w-[1600px]">
        <header className="app-page-header lg:flex lg:items-center lg:justify-between lg:gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-[#075f8f]"><Wrench className="h-4 w-4" /> Routine Maintenance</div>
            <h1 className="mt-2 text-2xl font-bold text-[#16263c] sm:text-3xl">{mode === "records" ? "UA Maintenance Records" : mode === "masterData" ? "UA Maintenance Data" : "UA Maintenance Check"}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6b7d92]">{mode === "records" ? "View, download, edit, duplicate, or delete saved maintenance checks." : mode === "masterData" ? "Manage paired UA models, UA IDs, and checklist descriptions." : "Complete and document routine UA maintenance inspections."}</p>
          </div>
          <button type="button" onClick={startNewRecord} className="app-button-primary mt-4 h-12 w-full lg:mt-0 lg:h-11 lg:w-auto"><Plus className="h-4 w-4" /> New maintenance check</button>
        </header>

        {mode === "checklist" ? (
          <>
            <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5 md:grid-cols-3">
              <Field label="UA Brand / Model"><select className={inputClass} value={record.uaModel} onChange={(event) => { const selected = activeModels.find((item) => item.value === event.target.value); updateRecord({ uaModel: event.target.value, uaId: selected?.linkedUaId || "" }); }}><option value="">Select UA model</option>{activeModels.map((item) => <option key={item.id} value={item.value}>{item.value}</option>)}</select></Field>
              <Field label="UA ID No."><input className={`${inputClass} cursor-not-allowed bg-slate-100 text-slate-600`} value={record.uaId} readOnly placeholder="Filled automatically" /></Field>
              <Field label="Maintenance date"><input type="date" className={inputClass} value={record.inspectionDate} max={new Date().toISOString().slice(0, 10)} onChange={(event) => updateRecord({ inspectionDate: event.target.value })} /></Field>
            </section>

            <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:p-5">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="text-lg font-bold text-slate-950">Maintenance checklist</h2><p className="text-sm text-slate-500">Select Pass, Fail, or N/A and add remarks where required.</p></div><div className="flex items-center gap-2"><Activity className="hidden h-4 w-4 text-slate-400 sm:block" /><div className="grid flex-1 grid-cols-3 gap-2"><span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs font-bold text-emerald-700">{resultSummary.pass} Pass</span><span className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-700">{resultSummary.fail} Fail</span><span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs font-bold text-slate-600">{resultSummary.na} N/A</span></div></div></div>
              <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white xl:block">
                <div className="grid grid-cols-[54px_minmax(320px,1fr)_160px_minmax(220px,0.7fr)] bg-slate-100 px-4 py-3 text-xs font-bold uppercase text-slate-600"><span>S/N</span><span>Description</span><span>Status</span><span>Remarks</span></div>
                {record.items.map((item, index) => <div key={item.itemId} className="grid grid-cols-[54px_minmax(320px,1fr)_160px_minmax(220px,0.7fr)] items-center border-t border-slate-200 px-4 py-3"><span className="text-sm font-bold text-slate-400">{index + 1}</span><p className="pr-4 text-sm font-medium leading-5 text-slate-900">{item.description}</p><select className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm" value={item.status} onChange={(event) => updateItem(item.itemId, { status: event.target.value as UaMaintenanceStatus })}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><input className="ml-3 h-10 rounded-lg border border-slate-300 px-3 text-sm" value={item.remarks} onChange={(event) => updateItem(item.itemId, { remarks: event.target.value })} placeholder="Optional remarks" /></div>)}
              </div>
              <div className="space-y-3 xl:hidden">{record.items.map((item, index) => <article key={item.itemId} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">{index + 1}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold leading-5 text-slate-950">{item.description}</p><span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[11px] font-bold ${statusStyle(item.status)}`}>{statusOptions.find((option) => option.value === item.status)?.label || "Not selected"}</span></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Status"><select className={inputClass} value={item.status} onChange={(event) => updateItem(item.itemId, { status: event.target.value as UaMaintenanceStatus })}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="Remarks"><input className={inputClass} value={item.remarks} onChange={(event) => updateItem(item.itemId, { remarks: event.target.value })} placeholder="Optional remarks" /></Field></div></article>)}</div>
            </section>

            <section className="grid gap-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:grid-cols-2">
              <div className="space-y-4"><Field label="Recommendation"><textarea className="mt-2 min-h-28 w-full rounded-lg border border-slate-300 p-3 text-base outline-none focus:border-sky-600 md:text-sm" value={record.recommendation} onChange={(event) => updateRecord({ recommendation: event.target.value })} placeholder="Enter maintenance recommendation" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Checked by"><input className={inputClass} value={record.checkedByName} onChange={(event) => updateRecord({ checkedByName: event.target.value })} /></Field><Field label="ID No."><input className={inputClass} value={record.checkedByIdNo} onChange={(event) => updateRecord({ checkedByIdNo: event.target.value })} /></Field></div></div>
              <div><label className="text-sm font-semibold text-slate-800">Checker signature</label>{record.signatureDataUrl ? <div className="mt-2 flex min-h-36 items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><img src={record.signatureDataUrl} alt="Uploaded checker signature" className="max-h-24 max-w-[75%] object-contain" /><button type="button" onClick={() => updateRecord({ signatureDataUrl: "" })} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600" aria-label="Remove signature"><X className="h-4 w-4" /></button></div> : <label className="mt-2 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-4 text-center hover:border-sky-500 hover:bg-sky-50"><Upload className="h-5 w-5 text-sky-700" /><span className="mt-2 text-sm font-semibold text-slate-800">Upload signature image</span><span className="mt-1 text-xs text-slate-500">PNG or JPG, maximum 3 MB</span><input type="file" accept="image/*" className="sr-only" onChange={(event) => void handleSignature(event.target.files?.[0])} /></label>}</div>
            </section>

            <footer className="sticky bottom-0 z-20 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:-mx-7 md:px-7 lg:static lg:mx-0 lg:flex lg:justify-end lg:border-0 lg:bg-transparent lg:px-0"><div className="grid grid-cols-2 gap-2 sm:flex"><button type="button" onClick={() => void preparePdf(record, "preview")} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"><Eye className="h-4 w-4" /> Preview</button><button type="button" onClick={() => void preparePdf(record, "download")} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"><Download className="h-4 w-4" /> PDF</button><button type="button" onClick={() => void saveRecord()} className="col-span-2 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-sky-700 px-5 text-sm font-semibold text-white"><Save className="h-4 w-4" /> Save maintenance check</button></div></footer>
          </>
        ) : null}

        {mode === "records" ? (
          <section className="space-y-4">
            <div className="app-toolbar justify-start">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#edf5f8] text-[#075f8f] ring-1 ring-[#d5e9f1]"><CalendarDays className="h-5 w-5" /></div>
              <div><p className="app-section-label">Inspection library</p><h2 className="font-bold text-[#16263c]">Maintenance history</h2><p className="text-sm text-[#6b7d92]">Search and filter completed checks by aircraft and date.</p></div>
            </div>
            <div className="app-toolbar grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_150px_150px_auto]"><label className="relative sm:col-span-2 xl:col-span-1"><span className="sr-only">Search maintenance records</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7e8fa3]" /><input className={`${inputClass} mt-0 pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search model, UA ID, or checker" /></label><select className={`${inputClass} mt-0`} value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}><option value="">All months</option>{monthOptions.map((month, index) => <option key={month} value={String(index + 1).padStart(2, "0")}>{month}</option>)}</select><select className={`${inputClass} mt-0`} value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}><option value="">All years</option>{yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select><button type="button" onClick={() => { setSearch(""); setSelectedMonth(""); setSelectedYear(""); }} disabled={!search && !selectedMonth && !selectedYear} className="app-button-secondary h-12 md:h-11"><X className="h-4 w-4" /> Clear</button></div>
            <div className="app-table-shell relative min-h-40">
              <div className="divide-y divide-[#e4eaf1] lg:hidden">{records.map((item) => <article key={item.id} className="border-l-[3px] border-l-[#1686b1] p-4 transition hover:bg-[#f7fafc]"><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#edf5f8] text-[#075f8f]"><Wrench className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="truncate font-semibold text-[#16263c]">{item.uaModel}</p><p className="truncate text-sm text-[#6b7d92]">{item.uaId}</p><p className="mt-1 text-xs text-[#7e8fa3]">{formatDate(item.inspectionDate)}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.failCount ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{item.failCount ? `${item.failCount} fail` : `${item.passCount}/${item.totalCount}`}</span></div><div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-[#e5ebf2] pt-3"><IconButton label="View record" icon={Eye} onClick={() => void viewRecord(item.id)} /><IconButton label="Edit record" icon={Edit3} onClick={() => void editRecord(item.id)} /><IconButton label="Duplicate record" icon={Copy} onClick={() => void duplicateRecord(item.id)} /><IconButton label="Download PDF" icon={Download} onClick={() => void downloadRecord(item.id)} /><IconButton label="Delete record" icon={Trash2} danger onClick={() => void removeRecord(item)} /></div></article>)}{!records.length && !recordsLoading ? <div className="px-5 py-14 text-center text-sm text-[#718096]">No maintenance records found.</div> : null}</div>
              <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[980px] text-left text-sm"><thead><tr className="app-table-header"><th className="px-5 py-3 font-semibold">UA Brand / Model</th><th className="px-5 py-3 font-semibold">UA ID No.</th><th className="px-5 py-3 font-semibold">Date</th><th className="px-5 py-3 font-semibold">Checked by</th><th className="px-5 py-3 font-semibold">Result</th><th className="px-5 py-3 text-right font-semibold">Actions</th></tr></thead><tbody>{records.map((item) => <tr key={item.id} className="border-b border-[#e7edf3] hover:bg-[#f7fafc]"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#edf5f8] text-[#075f8f]"><Wrench className="h-5 w-5" /></div><span className="font-semibold text-[#16263c]">{item.uaModel || "-"}</span></div></td><td className="px-5 py-4 text-[#506278]">{item.uaId || "-"}</td><td className="whitespace-nowrap px-5 py-4 text-[#506278]">{formatDate(item.inspectionDate)}</td><td className="px-5 py-4 text-[#506278]">{item.checkedByName || "-"}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${item.failCount ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{item.failCount ? `${item.failCount} failed` : `${item.passCount} passed`}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-2"><IconButton label="View record" icon={Eye} onClick={() => void viewRecord(item.id)} /><IconButton label="Edit record" icon={Edit3} onClick={() => void editRecord(item.id)} /><IconButton label="Duplicate record" icon={Copy} onClick={() => void duplicateRecord(item.id)} /><IconButton label="Download PDF" icon={Download} onClick={() => void downloadRecord(item.id)} /><IconButton label="Delete record" icon={Trash2} danger onClick={() => void removeRecord(item)} /></div></td></tr>)}{!records.length && !recordsLoading ? <tr><td colSpan={6} className="px-5 py-14 text-center text-[#718096]">No maintenance records found.</td></tr> : null}</tbody></table></div>
              {recordsLoading ? <div className="absolute inset-0 flex items-center justify-center bg-white/80"><div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold shadow-lg"><Loader2 className="h-4 w-4 animate-spin text-sky-700" /> Loading records...</div></div> : null}
              <div className="flex flex-col gap-3 border-t border-[#dbe3ec] bg-[#fbfcfd] p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-[#6b7d92]">Showing {records.length} of {recordsPage.totalRecords} records / Page {recordsPage.page} of {recordsPage.totalPages}</p><div className="grid grid-cols-2 gap-2"><button type="button" disabled={!recordsPage.hasPreviousPage || recordsLoading} onClick={() => void loadRecordsPage(recordsPage.page - 1)} className="app-button-secondary"><ChevronLeft className="h-4 w-4" /> Previous</button><button type="button" disabled={!recordsPage.hasNextPage || recordsLoading} onClick={() => void loadRecordsPage(recordsPage.page + 1)} className="app-button-secondary">Next <ChevronRight className="h-4 w-4" /></button></div></div>
            </div>
          </section>
        ) : null}

        {mode === "masterData" ? (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:flex-row lg:items-end lg:justify-between"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700"><ShieldCheck className="h-5 w-5" /></div><div><h2 className="text-xl font-bold text-slate-950">UA Maintenance master data</h2><p className="text-sm text-slate-500">Inactive values remain in saved records but are hidden from new checks.</p></div></div><button type="button" onClick={() => void saveMasterData()} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm"><Save className="h-4 w-4" /> Save master data</button></div>
            <div className="grid grid-cols-2 gap-2">{(["uaModels", "descriptions"] as UaMaintenanceMasterSection[]).map((section) => <button key={section} type="button" onClick={() => setMasterSection(section)} className={`min-w-0 rounded-lg border px-3 py-3 text-sm font-semibold shadow-sm transition ${masterSection === section ? "border-cyan-600 bg-cyan-50 text-cyan-900 ring-1 ring-cyan-600" : "border-slate-200 bg-white text-slate-600 hover:border-cyan-300"}`}><span className="block truncate">{sectionLabels[section]}</span><span className="mt-1 block text-xs font-normal">{masterData[section].length} values</span></button>)}</div>
            <div className={`mt-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 ${masterSection === "uaModels" ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" : "sm:grid-cols-[minmax(0,1fr)_auto]"}`}><input className="h-12 rounded-lg border border-slate-300 px-3 text-sm" value={newMasterValue} onChange={(event) => setNewMasterValue(event.target.value)} placeholder={masterSection === "uaModels" ? "UA Brand / Model" : "Checklist description"} />{masterSection === "uaModels" ? <input className="h-12 rounded-lg border border-slate-300 px-3 text-sm" value={newMasterUaId} onChange={(event) => setNewMasterUaId(event.target.value)} placeholder="UA ID No." /> : null}<button type="button" onClick={addMasterItem} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Add value</button></div>
            <div className="mt-4 space-y-2">{masterData[masterSection].slice().sort((a, b) => a.sortOrder - b.sortOrder).map((item, index) => <div key={item.id} className={`grid gap-3 rounded-lg border border-slate-200 bg-white p-3 ${masterSection === "uaModels" ? "sm:grid-cols-[40px_minmax(0,1fr)_minmax(0,1fr)_120px_auto]" : "sm:grid-cols-[40px_minmax(0,1fr)_120px_auto]"} sm:items-center`}><span className="text-sm font-bold text-slate-400">{index + 1}</span>{masterSection === "descriptions" ? <textarea className="min-h-20 rounded-lg border border-slate-300 p-3 text-sm" value={item.value} onChange={(event) => updateMasterItem(masterSection, item.id, { value: event.target.value })} /> : <><input className="h-11 rounded-lg border border-slate-300 px-3 text-sm" value={item.value} onChange={(event) => updateMasterItem(masterSection, item.id, { value: event.target.value })} /><input className="h-11 rounded-lg border border-slate-300 px-3 text-sm" value={item.linkedUaId || ""} onChange={(event) => updateMasterItem(masterSection, item.id, { linkedUaId: event.target.value })} placeholder="UA ID No." /></>}<button type="button" onClick={() => updateMasterItem(masterSection, item.id, { status: item.status === "active" ? "inactive" : "active" })} className={`h-10 rounded-lg border px-3 text-xs font-bold ${item.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}>{item.status === "active" ? "Active" : "Inactive"}</button><IconButton label="Delete value" icon={Trash2} danger onClick={() => void removeMasterItem(masterSection, item)} /></div>)}</div>
          </section>
        ) : null}
      </div>

      {viewingRecord ? <MaintenanceModal record={viewingRecord} onClose={() => setViewingRecord(null)} onDownload={() => void preparePdf(viewingRecord, "download")} onPrint={() => void preparePdf(viewingRecord, "print")} /> : null}
      {working ? <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"><div className="flex w-full max-w-sm items-center gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-2xl"><Loader2 className="h-5 w-5 animate-spin text-sky-700" /><div><p className="text-sm font-semibold text-slate-950">Please wait</p><p className="text-sm text-slate-500">{working}</p></div></div></div> : null}
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-semibold text-slate-800">{label}{children}</label>;
}

function IconButton({ label, icon: Icon, onClick, danger = false }: { label: string; icon: typeof Eye; onClick: () => void; danger?: boolean }) {
  return <button type="button" onClick={onClick} title={label} aria-label={label} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white shadow-sm transition ${danger ? "border-rose-200 text-rose-600 hover:border-rose-300 hover:bg-rose-50" : "border-[#d7e0ea] text-[#607389] hover:border-[#9ec3d7] hover:bg-[#f1f8fb] hover:text-[#075f8f]"}`}><Icon className="h-4 w-4" /></button>;
}

function formatDate(value: string) {
  if (!value) return "-";
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
}

function MaintenanceModal({ record, onClose, onDownload, onPrint }: { record: UaMaintenanceRecord; onClose: () => void; onDownload: () => void; onPrint: () => void }) {
  return <div className="app-overlay-enter fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-5"><button type="button" className="absolute inset-0 bg-[#102a43]/60 backdrop-blur-[2px]" onClick={onClose} aria-label="Close maintenance record" /><div className="app-panel-enter relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-lg border border-[#d7e0ea] bg-white shadow-[0_24px_64px_rgba(16,42,67,0.3)] sm:max-w-5xl sm:rounded-lg"><header className="flex items-start justify-between gap-4 border-b border-[#dbe6ed] bg-[#f1f7fa] p-4 sm:px-6"><div className="min-w-0"><p className="text-xs font-bold uppercase text-[#075f8f]">Routine UA Maintenance</p><h2 className="mt-1 truncate text-xl font-bold text-[#16263c]">{record.uaModel}</h2><p className="mt-1 text-sm text-[#6b7d92]">{record.uaId} / {formatDate(record.inspectionDate)}</p></div><IconButton label="Close" icon={X} onClick={onClose} /></header><div className="overflow-y-auto p-4 sm:p-6"><div className="grid gap-3 sm:grid-cols-3"><Detail label="Checked by" value={record.checkedByName} /><Detail label="ID No." value={record.checkedByIdNo} /><Detail label="Signature" value={record.signatureDataUrl ? "Captured" : "Not captured"} /></div><div className="mt-5 overflow-x-auto rounded-lg border border-[#dbe3ec]"><table className="w-full min-w-[760px] text-left text-sm"><thead className="app-table-header"><tr><th className="px-4 py-3">S/N</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Remarks</th></tr></thead><tbody>{record.items.map((item, index) => <tr key={item.itemId} className="border-t border-[#e7edf3]"><td className="px-4 py-3 font-semibold">{index + 1}</td><td className="px-4 py-3">{item.description}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusStyle(item.status)}`}>{statusOptions.find((option) => option.value === item.status)?.label || "Not selected"}</span></td><td className="px-4 py-3">{item.remarks || "-"}</td></tr>)}</tbody></table></div><div className="mt-4 rounded-lg border border-[#e1e8ef] bg-[#f7f9fb] p-4"><p className="text-xs font-bold uppercase text-[#718096]">Recommendation</p><p className="mt-2 whitespace-pre-wrap text-sm text-[#405168]">{record.recommendation || "-"}</p></div></div><footer className="grid grid-cols-3 gap-2 border-t border-[#dbe3ec] bg-[#f7f9fb] p-4"><button type="button" onClick={onClose} className="app-button-secondary h-12">Close</button><button type="button" onClick={onPrint} className="app-button-secondary h-12"><Printer className="h-4 w-4" /> Print</button><button type="button" onClick={onDownload} className="app-button-primary h-12"><Download className="h-4 w-4" /> PDF</button></footer></div></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-[#e1e8ef] bg-[#f7f9fb] p-3"><p className="text-[11px] font-bold uppercase text-[#718096]">{label}</p><p className="mt-1 break-words text-sm font-semibold text-[#16263c]">{value || "-"}</p></div>;
}


