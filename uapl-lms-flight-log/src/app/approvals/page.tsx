"use client";

import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  BellRing,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  Loader2,
  MapPin,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import {
  archiveApprovalRecord,
  deleteApprovalDocument,
  fetchApprovalDashboardSummary,
  fetchApprovalDocumentFile,
  fetchApprovalRecord,
  fetchApprovalsPage,
  saveApprovalRecord,
  uploadApprovalDocument,
  type ApprovalsPage
} from "@/lib/approvals-api";
import {
  APPROVAL_EXPIRY_LABELS,
  APPROVAL_RENEWAL_LABELS,
  APPROVAL_TYPE_LABELS,
  APPROVAL_TYPE_OPTIONS,
  CAAS_ESOMS_URL,
  createEmptyApprovalLocation,
  createEmptyApprovalRecord,
  summarizeApprovalRecord,
  validateApprovalRecord,
  type ApprovalDashboardSummary,
  type ApprovalDocument,
  type ApprovalExpiryStatus,
  type ApprovalLocation,
  type ApprovalRecord,
  type ApprovalRecordSummary,
  type ApprovalRenewalStatus,
  type ApprovalType
} from "@/lib/approvals";

const inputClass =
  "mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-100 md:h-11 md:text-sm";

const emptyPage: ApprovalsPage = {
  records: [],
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false
};

const emptyDashboard: ApprovalDashboardSummary = {
  totalApprovals: 0,
  activeApprovals: 0,
  renewalUpcoming: 0,
  dueSoon: 0,
  urgent: 0,
  expiringToday: 0,
  expired: 0,
  missingDocuments: 0,
  nextExpiry: null
};

function formatDate(value: string) {
  if (!value) return "-";
  const parts = value.slice(0, 10).split("-");
  if (parts.length !== 3) return value;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return date.toLocaleDateString("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-SG", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
}

function expiryTone(status: ApprovalExpiryStatus) {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "renewal_upcoming") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "due_soon") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "urgent" || status === "expires_today") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }
  if (status === "expired") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function readableDays(days: number | null) {
  if (days === null) return "Expiry date required";
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Expires today";
  return `${days} day${days === 1 ? "" : "s"} remaining`;
}

export default function ApprovalsPage() {
  const message = useAppMessage();
  const [page, setPage] = useState(emptyPage);
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [working, setWorking] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ApprovalType | "">("");
  const [statusFilter, setStatusFilter] = useState<ApprovalExpiryStatus | "">("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [form, setForm] = useState<ApprovalRecord | null>(null);
  const [formDocument, setFormDocument] = useState<File | null>(null);
  const [viewing, setViewing] = useState<ApprovalRecord | null>(null);
  const [preview, setPreview] = useState<{ name: string; dataUrl: string } | null>(null);

  async function loadDashboard() {
    setDashboard(await fetchApprovalDashboardSummary());
  }

  async function loadPage(requestedPage = 1, quiet = false) {
    if (!quiet) setTableLoading(true);
    try {
      setPage(
        await fetchApprovalsPage({
          page: requestedPage,
          pageSize: 10,
          search,
          approvalType: typeFilter,
          expiryStatus: statusFilter,
          includeArchived
        })
      );
    } catch (error) {
      message.error(
        "Approvals could not be loaded",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      if (!quiet) setTableLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function initialize() {
      setLoading(true);
      try {
        const [records, summary] = await Promise.all([
          fetchApprovalsPage({ page: 1, pageSize: 10 }),
          fetchApprovalDashboardSummary()
        ]);
        if (!active) return;
        setPage(records);
        setDashboard(summary);
      } catch (error) {
        message.error(
          "Approval monitoring could not be loaded",
          error instanceof Error ? error.message : "Please try again."
        );
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => void loadPage(1), 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter, statusFilter, includeArchived]);

  function openNew() {
    setForm(createEmptyApprovalRecord());
    setFormDocument(null);
  }

  async function openRecord(id: string, edit = false) {
    setWorking(edit ? "Opening approval for editing..." : "Loading approval details...");
    try {
      const record = await fetchApprovalRecord(id);
      if (edit) {
        setForm(record);
        setFormDocument(null);
      } else {
        setViewing(record);
      }
    } catch (error) {
      message.error(
        "Approval could not be opened",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking("");
    }
  }

  async function submitRecord() {
    if (!form) return;
    const validation = validateApprovalRecord(form, false);
    if (!validation.valid) {
      message.warning("Check the approval details", validation.errors[0]);
      return;
    }
    const isNew = !page.records.some((record) => record.id === form.id);
    const hasCurrentDocument = form.documents.some(
      (document) => document.status === "current" && document.driveFileId
    );
    if (isNew && !hasCurrentDocument && !formDocument) {
      message.warning("Approval PDF required", "Upload the current approval document before saving.");
      return;
    }

    setWorking(formDocument ? "Saving approval and uploading PDF..." : "Saving approval...");
    try {
      let saved = await saveApprovalRecord(form);
      if (formDocument) {
        await uploadApprovalDocument({ approvalId: saved.id, file: formDocument });
        saved = await fetchApprovalRecord(saved.id);
      }
      setForm(null);
      setFormDocument(null);
      await Promise.all([loadPage(1, true), loadDashboard()]);
      message.success(
        isNew ? "Approval created" : "Approval updated",
        `${APPROVAL_TYPE_LABELS[saved.approvalType]} has been saved.`
      );
    } catch (error) {
      message.error(
        "Approval was not saved",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking("");
    }
  }

  async function archiveRecord(record: ApprovalRecordSummary) {
    const confirmed = await message.confirm({
      title: "Archive approval?",
      message: `${APPROVAL_TYPE_LABELS[record.approvalType]} ${record.approvalNumber} will leave the active register. Its audit history and documents will remain available.`,
      confirmLabel: "Archive approval",
      variant: "danger"
    });
    if (!confirmed) return;

    setWorking("Archiving approval...");
    try {
      await archiveApprovalRecord(record.id);
      await Promise.all([loadPage(1, true), loadDashboard()]);
      message.success("Approval archived", "The approval has been removed from the active register.");
    } catch (error) {
      message.error(
        "Approval was not archived",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking("");
    }
  }

  async function uploadDocument(file: File | undefined, locationId = "") {
    if (!file || !viewing) return;
    setWorking("Uploading approval PDF to Google Drive...");
    try {
      await uploadApprovalDocument({ approvalId: viewing.id, locationId, file });
      const refreshed = await fetchApprovalRecord(viewing.id);
      setViewing(refreshed);
      await Promise.all([loadPage(page.page, true), loadDashboard()]);
      message.success("Document uploaded", "The previous current PDF is retained as superseded history.");
    } catch (error) {
      message.error(
        "PDF upload failed",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking("");
    }
  }

  async function openDocument(document: ApprovalDocument) {
    setWorking("Opening approval PDF...");
    try {
      const file = await fetchApprovalDocumentFile(document.id);
      setPreview({ name: file.document.fileName, dataUrl: file.dataUrl });
    } catch (error) {
      message.error(
        "PDF could not be opened",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking("");
    }
  }

  async function removeDocument(document: ApprovalDocument) {
    if (!viewing) return;
    const confirmed = await message.confirm({
      title: "Delete this PDF?",
      message: `${document.fileName} will be removed from the register and moved to Google Drive trash.`,
      confirmLabel: "Delete PDF",
      variant: "danger"
    });
    if (!confirmed) return;

    setWorking("Deleting approval PDF...");
    try {
      await deleteApprovalDocument(document.id);
      const refreshed = await fetchApprovalRecord(viewing.id);
      setViewing(refreshed);
      await Promise.all([loadPage(page.page, true), loadDashboard()]);
      message.success("Document deleted");
    } catch (error) {
      message.error(
        "PDF was not deleted",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking("");
    }
  }

  const filtersActive = Boolean(search || typeFilter || statusFilter || includeArchived);

  if (loading) {
    return (
      <AppShell>
        <CenteredLoading label="Loading approval monitoring..." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-sky-700">
              <ShieldCheck className="h-4 w-4" /> Compliance Control
            </div>
            <h1 className="mt-2 text-2xl font-bold text-slate-800 sm:text-3xl">
              AGA Approvals
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Monitor regulatory approvals, permitted locations, renewal progress, and controlled PDF documents.
            </p>
          </div>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 lg:h-11"
          >
            <Plus className="h-4 w-4" /> Add approval
          </button>
        </header>

        <SummaryGrid dashboard={dashboard} />

        {dashboard.nextExpiry ? (
          <section className="flex flex-col gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <BellRing className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900">Next regulatory expiry</p>
                <p className="mt-0.5 text-sm text-slate-700">
                  {APPROVAL_TYPE_LABELS[dashboard.nextExpiry.approvalType]} {dashboard.nextExpiry.approvalNumber} expires on {formatDate(dashboard.nextExpiry.displayExpiryDate)}.
                </p>
              </div>
            </div>
            <a
              href={CAAS_ESOMS_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-700 px-4 text-sm font-semibold text-white hover:bg-amber-800"
            >
              Renew in CAAS eSOMS <ExternalLink className="h-4 w-4" />
            </a>
          </section>
        ) : null}

        <section>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_220px_190px_auto]">
            <label className="relative md:col-span-2 xl:col-span-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className={`${inputClass} mt-0 pl-10`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search number, authority, or responsible person"
              />
            </label>
            <select
              className={`${inputClass} mt-0`}
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as ApprovalType | "")}
            >
              <option value="">All approval types</option>
              {APPROVAL_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              className={`${inputClass} mt-0`}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ApprovalExpiryStatus | "")}
            >
              <option value="">All expiry statuses</option>
              {Object.entries(APPROVAL_EXPIRY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!filtersActive}
              onClick={() => {
                setSearch("");
                setTypeFilter("");
                setStatusFilter("");
                setIncludeArchived(false);
              }}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-40 md:h-11"
            >
              <X className="h-4 w-4" /> Clear
            </button>
          </div>
          <label className="mt-3 inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
            />
            Include archived approvals
          </label>

          <ApprovalRegister
            page={page}
            loading={tableLoading}
            onPage={loadPage}
            onView={(id) => void openRecord(id)}
            onEdit={(id) => void openRecord(id, true)}
            onArchive={(record) => void archiveRecord(record)}
          />
        </section>
      </div>

      {form ? (
        <ApprovalEditor
          record={form}
          document={formDocument}
          setRecord={setForm}
          setDocument={setFormDocument}
          onClose={() => {
            setForm(null);
            setFormDocument(null);
          }}
          onSave={() => void submitRecord()}
        />
      ) : null}

      {viewing ? (
        <ApprovalDetail
          record={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setForm(viewing);
            setFormDocument(null);
            setViewing(null);
          }}
          onOpen={(document) => void openDocument(document)}
          onDelete={(document) => void removeDocument(document)}
          onUpload={(file, locationId) => void uploadDocument(file, locationId)}
        />
      ) : null}

      {preview ? (
        <PdfPreview
          name={preview.name}
          dataUrl={preview.dataUrl}
          onClose={() => setPreview(null)}
        />
      ) : null}

      {working ? (
        <LoadingOverlay
          label={working}
          description="Your request is being completed securely."
          delay={100}
        />
      ) : null}
    </AppShell>
  );
}

function SummaryGrid({ dashboard }: { dashboard: ApprovalDashboardSummary }) {
  const cards = [
    ["Tracked", dashboard.totalApprovals, ShieldCheck, "bg-sky-50 text-sky-700"],
    ["Active", dashboard.activeApprovals, BadgeCheck, "bg-emerald-50 text-emerald-700"],
    ["Renewal Window", dashboard.renewalUpcoming + dashboard.dueSoon, CalendarClock, "bg-amber-50 text-amber-700"],
    ["Urgent / Expired", dashboard.urgent + dashboard.expiringToday + dashboard.expired, AlertTriangle, "bg-rose-50 text-rose-700"],
    ["Missing PDF", dashboard.missingDocuments, FileText, "bg-violet-50 text-violet-700"]
  ] as const;

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {cards.map(([label, value, Icon, tone], index) => (
        <div
          key={label}
          className={`min-w-0 rounded-lg border bg-white p-4 shadow-sm ${index === 4 ? "col-span-2 md:col-span-1" : "border-slate-200"}`}
        >
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
            <Icon className="h-4 w-4" />
          </div>
          <p className="mt-4 text-2xl font-bold text-slate-950">{value}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{label}</p>
        </div>
      ))}
    </section>
  );
}

function ApprovalRegister({
  page,
  loading,
  onPage,
  onView,
  onEdit,
  onArchive
}: {
  page: ApprovalsPage;
  loading: boolean;
  onPage: (page: number) => Promise<void>;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onArchive: (record: ApprovalRecordSummary) => void;
}) {
  return (
    <div className="relative mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="divide-y divide-slate-200 lg:hidden">
        {page.records.map((record) => (
          <article key={record.id} className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                {record.approvalType === "class_1_activity_permit" ? <MapPin className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-950">{APPROVAL_TYPE_LABELS[record.approvalType]}</p>
                <p className="truncate text-sm text-slate-600">{record.approvalNumber}</p>
                <p className="mt-1 text-xs text-slate-500">Expires {formatDate(record.displayExpiryDate)}</p>
              </div>
              <ExpiryBadge status={record.expiryStatus} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <span>{readableDays(record.daysRemaining)}</span>
              <span className="text-right">{record.documentCount} PDF{record.documentCount === 1 ? "" : "s"}</span>
              {record.approvalType === "class_1_activity_permit" ? (
                <span className="col-span-2">{record.activeLocationCount} active permitted location{record.activeLocationCount === 1 ? "" : "s"}</span>
              ) : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <IconButton label="View approval" icon={Eye} onClick={() => onView(record.id)} />
              <IconButton label="Edit approval" icon={Edit3} onClick={() => onEdit(record.id)} />
              {!record.archived ? <IconButton label="Archive approval" icon={Archive} danger onClick={() => onArchive(record)} /> : null}
            </div>
          </article>
        ))}
        {!page.records.length && !loading ? <EmptyState /> : null}
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <Th>Approval</Th>
              <Th>Effective</Th>
              <Th>Expiry</Th>
              <Th>Status</Th>
              <Th>Responsible Person</Th>
              <Th>Locations</Th>
              <Th>Documents</Th>
              <Th right>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {page.records.map((record) => (
              <tr key={record.id} className="border-b border-slate-100 transition hover:bg-slate-50/70">
                <Td>
                  <p className="font-bold text-slate-950">{APPROVAL_TYPE_LABELS[record.approvalType]}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{record.approvalNumber}</p>
                </Td>
                <Td>{formatDate(record.effectiveDate)}</Td>
                <Td>
                  <p className="font-semibold text-slate-800">{formatDate(record.displayExpiryDate)}</p>
                  <p className="text-xs text-slate-500">{readableDays(record.daysRemaining)}</p>
                </Td>
                <Td><ExpiryBadge status={record.expiryStatus} /></Td>
                <Td>
                  <p>{record.responsiblePerson || "-"}</p>
                  <p className="text-xs text-slate-500">{record.responsibleEmail}</p>
                </Td>
                <Td>{record.approvalType === "class_1_activity_permit" ? record.activeLocationCount : "-"}</Td>
                <Td>
                  <span className={record.hasCurrentDocument ? "font-semibold text-emerald-700" : "font-semibold text-rose-600"}>
                    {record.hasCurrentDocument ? `${record.documentCount} stored` : "PDF missing"}
                  </span>
                </Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <IconButton label="View approval" icon={Eye} onClick={() => onView(record.id)} />
                    <IconButton label="Edit approval" icon={Edit3} onClick={() => onEdit(record.id)} />
                    {!record.archived ? <IconButton label="Archive approval" icon={Archive} danger onClick={() => onArchive(record)} /> : null}
                  </div>
                </Td>
              </tr>
            ))}
            {!page.records.length && !loading ? (
              <tr><td colSpan={8}><EmptyState /></td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {loading ? <TableLoading /> : null}
      <Pagination page={page} loading={loading} onPage={onPage} />
    </div>
  );
}

function ApprovalEditor({
  record,
  document,
  setRecord,
  setDocument,
  onClose,
  onSave
}: {
  record: ApprovalRecord;
  document: File | null;
  setRecord: (record: ApprovalRecord | null) => void;
  setDocument: (file: File | null) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const patch = (changes: Partial<ApprovalRecord>) => setRecord({ ...record, ...changes });
  const updateLocation = (id: string, changes: Partial<ApprovalLocation>) => {
    patch({
      locations: record.locations.map((location) =>
        location.id === id ? { ...location, ...changes } : location
      )
    });
  };
  const removeLocation = (id: string) => {
    patch({ locations: record.locations.filter((location) => location.id !== id) });
  };

  return (
    <Modal
      title={record.approvalNumber || "New Approval"}
      subtitle="Approval Register"
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={onSave}><Save className="h-4 w-4" /> Save approval</PrimaryButton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Approval Type">
          <select
            className={inputClass}
            value={record.approvalType}
            onChange={(event) => {
              const approvalType = event.target.value as ApprovalType;
              patch({
                approvalType,
                locations:
                  approvalType === "class_1_activity_permit"
                    ? record.locations.length ? record.locations : [createEmptyApprovalLocation()]
                    : []
              });
            }}
          >
            {APPROVAL_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Approval / Permit Number">
          <input className={inputClass} value={record.approvalNumber} onChange={(event) => patch({ approvalNumber: event.target.value })} />
        </Field>
        <Field label="Issuing Authority">
          <input className={inputClass} value={record.issuingAuthority} onChange={(event) => patch({ issuingAuthority: event.target.value })} />
        </Field>
        <Field label="Effective Date">
          <input type="date" className={inputClass} value={record.effectiveDate} onChange={(event) => patch({ effectiveDate: event.target.value })} />
        </Field>
        <Field label="Expiry Date">
          <input type="date" className={inputClass} value={record.expiryDate} onChange={(event) => patch({ expiryDate: event.target.value })} />
        </Field>
        <Field label="Renewal Lead Time (Days)">
          <input type="number" min={1} max={365} className={inputClass} value={record.renewalLeadDays} onChange={(event) => patch({ renewalLeadDays: Number(event.target.value) || 90 })} />
        </Field>
        <Field label="Responsible Person">
          <input className={inputClass} value={record.responsiblePerson} onChange={(event) => patch({ responsiblePerson: event.target.value })} />
        </Field>
        <Field label="Responsible Email">
          <input type="email" className={inputClass} value={record.responsibleEmail} onChange={(event) => patch({ responsibleEmail: event.target.value })} />
        </Field>
        <Field label="Renewal Status">
          <select className={inputClass} value={record.renewalStatus} onChange={(event) => patch({ renewalStatus: event.target.value as ApprovalRenewalStatus })}>
            {Object.entries(APPROVAL_RENEWAL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        {record.renewalStatus === "submitted" ? (
          <>
            <Field label="Submitted Date">
              <input type="date" className={inputClass} value={record.renewalSubmittedAt.slice(0, 10)} onChange={(event) => patch({ renewalSubmittedAt: event.target.value })} />
            </Field>
            <Field label="Submission Reference">
              <input className={inputClass} value={record.renewalReference} onChange={(event) => patch({ renewalReference: event.target.value })} />
            </Field>
          </>
        ) : null}
      </div>

      {record.approvalType === "class_1_activity_permit" ? (
        <section className="mt-6 border-t border-slate-200 pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold text-slate-950">Permitted Locations</h3>
              <p className="text-sm text-slate-500">Each location has independent validity and operating conditions.</p>
            </div>
            <button type="button" onClick={() => patch({ locations: [...record.locations, createEmptyApprovalLocation()] })} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 text-sm font-semibold text-sky-800">
              <Plus className="h-4 w-4" /> Add location
            </button>
          </div>
          <div className="mt-4 space-y-4">
            {record.locations.map((location, index) => (
              <div key={location.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-bold text-slate-800"><MapPin className="h-4 w-4 text-sky-700" /> Location {index + 1}</div>
                  <IconButton label="Remove location" icon={Trash2} danger onClick={() => removeLocation(location.id)} />
                </div>
                <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Location Name"><input className={inputClass} value={location.name} onChange={(event) => updateLocation(location.id, { name: event.target.value })} /></Field>
                  <Field label="Location Code"><input className={inputClass} value={location.code} onChange={(event) => updateLocation(location.id, { code: event.target.value })} /></Field>
                  <Field label="Coordinates"><input className={inputClass} value={location.coordinates} onChange={(event) => updateLocation(location.id, { coordinates: event.target.value })} placeholder="1.3521, 103.8198" /></Field>
                  <Field label="Effective Date"><input type="date" className={inputClass} value={location.effectiveDate} onChange={(event) => updateLocation(location.id, { effectiveDate: event.target.value })} /></Field>
                  <Field label="Expiry Date"><input type="date" className={inputClass} value={location.expiryDate} onChange={(event) => updateLocation(location.id, { expiryDate: event.target.value })} /></Field>
                  <Field label="Status"><select className={inputClass} value={location.active ? "active" : "inactive"} onChange={(event) => updateLocation(location.id, { active: event.target.value === "active" })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <Field label="Address"><textarea className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" value={location.address} onChange={(event) => updateLocation(location.id, { address: event.target.value })} /></Field>
                  <Field label="Operational Limitations"><textarea className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" value={location.operationalLimitations} onChange={(event) => updateLocation(location.id, { operationalLimitations: event.target.value })} /></Field>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Field label="General Conditions"><textarea className="mt-2 min-h-28 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" value={record.generalConditions} onChange={(event) => patch({ generalConditions: event.target.value })} /></Field>
        <Field label="Remarks"><textarea className="mt-2 min-h-28 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" value={record.remarks} onChange={(event) => patch({ remarks: event.target.value })} /></Field>
      </div>

      <label className="mt-5 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-sky-300 bg-sky-50/50 p-4 text-center">
        <Upload className="h-5 w-5 text-sky-700" />
        <span className="mt-2 text-sm font-semibold text-slate-800">{document?.name || "Upload current approval PDF"}</span>
        <span className="mt-1 text-xs text-slate-500">PDF only, maximum 10 MB. Existing PDF history will be retained.</span>
        <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => setDocument(event.target.files?.[0] || null)} />
      </label>
    </Modal>
  );
}

function ApprovalDetail({
  record,
  onClose,
  onEdit,
  onOpen,
  onDelete,
  onUpload
}: {
  record: ApprovalRecord;
  onClose: () => void;
  onEdit: () => void;
  onOpen: (document: ApprovalDocument) => void;
  onDelete: (document: ApprovalDocument) => void;
  onUpload: (file: File | undefined, locationId?: string) => void;
}) {
  const summaryStatus = useMemo(
    () => summarizeApprovalRecord(record).expiryStatus,
    [record]
  );

  const generalDocuments = record.documents.filter((document) => !document.locationId);

  return (
    <Modal
      title={record.approvalNumber}
      subtitle={APPROVAL_TYPE_LABELS[record.approvalType]}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Close</SecondaryButton>
          <PrimaryButton onClick={onEdit}><Edit3 className="h-4 w-4" /> Edit approval</PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <ExpiryBadge status={summaryStatus} />
          <p className="mt-2 text-sm text-slate-600">Valid {formatDate(record.effectiveDate)} to {formatDate(record.expiryDate)}</p>
        </div>
        <a href={CAAS_ESOMS_URL} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white">
          Open CAAS eSOMS <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Issuing Authority" value={record.issuingAuthority} />
        <Detail label="Responsible Person" value={record.responsiblePerson} />
        <Detail label="Responsible Email" value={record.responsibleEmail} />
        <Detail label="Renewal Status" value={APPROVAL_RENEWAL_LABELS[record.renewalStatus]} />
        <Detail label="Lead Time" value={`${record.renewalLeadDays} days`} />
        <Detail label="Submission Date" value={formatDate(record.renewalSubmittedAt)} />
        <Detail label="Submission Reference" value={record.renewalReference} />
        <Detail label="Last Updated" value={formatDateTime(record.updatedAt)} />
      </div>

      {record.approvalType === "class_1_activity_permit" ? (
        <section className="mt-6">
          <h3 className="font-bold text-slate-950">Permitted Locations</h3>
          <div className="mt-3 space-y-3">
            {record.locations.map((location) => {
              const documents = record.documents.filter((document) => document.locationId === location.id);
              return (
                <div key={location.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-sky-700" /><p className="font-bold text-slate-900">{location.name}</p></div>
                      <p className="mt-1 text-sm text-slate-500">{location.address || "No address entered"}</p>
                      <p className="mt-1 text-xs text-slate-500">Valid to {formatDate(location.expiryDate)} / {location.active ? "Active" : "Inactive"}</p>
                    </div>
                    <UploadButton label="Upload location PDF" onFile={(file) => onUpload(file, location.id)} />
                  </div>
                  {location.operationalLimitations ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{location.operationalLimitations}</p> : null}
                  <DocumentList documents={documents} onOpen={onOpen} onDelete={onDelete} />
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-slate-950">Controlled Documents</h3>
            <p className="text-sm text-slate-500">Current and superseded versions remain traceable.</p>
          </div>
          <UploadButton label="Upload new PDF" onFile={(file) => onUpload(file)} />
        </div>
        <DocumentList documents={generalDocuments} onOpen={onOpen} onDelete={onDelete} />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <DetailBlock label="General Conditions" value={record.generalConditions} />
        <DetailBlock label="Remarks" value={record.remarks} />
      </div>
    </Modal>
  );
}

function DocumentList({ documents, onOpen, onDelete }: { documents: ApprovalDocument[]; onOpen: (document: ApprovalDocument) => void; onDelete: (document: ApprovalDocument) => void }) {
  return (
    <div className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {documents.map((document) => (
        <div key={document.id} className="flex items-center gap-3 p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-700"><FileText className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{document.fileName}</p>
            <p className="mt-0.5 text-xs text-slate-500">{document.status === "current" ? "Current version" : "Superseded"} / {formatDateTime(document.uploadedAt)}</p>
          </div>
          <IconButton label="View PDF" icon={Eye} onClick={() => onOpen(document)} />
          <IconButton label="Delete PDF" icon={Trash2} danger onClick={() => onDelete(document)} />
        </div>
      ))}
      {!documents.length ? <div className="p-5 text-center text-sm text-slate-500">No PDFs uploaded for this section.</div> : null}
    </div>
  );
}

function PdfPreview({ name, dataUrl, onClose }: { name: string; dataUrl: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[125] flex flex-col bg-slate-950/95 p-3 sm:p-5">
      <header className="flex items-center justify-between gap-3 rounded-t-lg bg-white px-4 py-3">
        <div className="min-w-0"><p className="truncate font-bold text-slate-900">{name}</p><p className="text-xs text-slate-500">Approval document preview</p></div>
        <div className="flex gap-2">
          <a href={dataUrl} download={name} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 text-sm font-semibold text-white"><FolderOpen className="h-4 w-4" /> <span className="hidden sm:inline">Download</span></a>
          <IconButton label="Close preview" icon={X} onClick={onClose} />
        </div>
      </header>
      <iframe title={name} src={dataUrl} className="min-h-0 flex-1 rounded-b-lg bg-white" />
    </div>
  );
}

function Modal({ title, subtitle, onClose, children, footer }: { title: string; subtitle: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-5">
      <button type="button" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" onClick={onClose} aria-label="Close dialog" />
      <div className="relative flex max-h-[96dvh] w-full flex-col overflow-hidden rounded-t-lg border border-slate-200 bg-white shadow-2xl sm:max-w-6xl sm:rounded-lg">
        <header className="flex items-start justify-between gap-4 border-b border-sky-100 bg-sky-50 p-4 sm:px-6">
          <div className="min-w-0"><p className="text-xs font-bold uppercase text-sky-700">{subtitle}</p><h2 className="mt-1 truncate text-xl font-bold text-slate-800">{title}</h2></div>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </header>
        <div className="overflow-y-auto p-4 text-slate-700 sm:p-6">{children}</div>
        <footer className="grid grid-cols-2 gap-2 border-t border-slate-200 bg-slate-50 p-4 sm:flex sm:justify-end">{footer}</footer>
      </div>
    </div>
  );
}

function ExpiryBadge({ status }: { status: ApprovalExpiryStatus }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${expiryTone(status)}`}>{APPROVAL_EXPIRY_LABELS[status]}</span>;
}

function UploadButton({ label, onFile }: { label: string; onFile: (file?: File) => void }) {
  return <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 text-sm font-semibold text-sky-800"><Upload className="h-4 w-4" /> {label}<input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => { onFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-semibold text-slate-600">{label}{children}</label>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-[11px] font-bold uppercase text-sky-700">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-700">{value || "-"}</p></div>;
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-sky-700">{label}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value || "-"}</p></div>;
}

function IconButton({ label, icon: Icon, onClick, danger = false }: { label: string; icon: typeof Eye; onClick: () => void; danger?: boolean }) {
  return <button type="button" onClick={onClick} title={label} aria-label={label} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition ${danger ? "border-rose-200 text-rose-600 hover:bg-rose-50" : "border-slate-200 text-slate-600 hover:bg-slate-100"}`}><Icon className="h-4 w-4" /></button>;
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-sky-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800">{children}</button>;
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className="inline-flex h-12 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700">{children}</button>;
}

function Th({ children, right = false }: { children: ReactNode; right?: boolean }) {
  return <th className={`px-4 py-3 font-semibold ${right ? "text-right" : ""}`}>{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td className="px-4 py-4 text-slate-700">{children}</td>;
}

function EmptyState() {
  return <div className="px-5 py-14 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">No approvals found</p><p className="mt-1 text-xs text-slate-500">Add an approval or adjust the active filters.</p></div>;
}

function CenteredLoading({ label }: { label: string }) {
  return <div className="flex min-h-[60vh] items-center justify-center"><div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-lg"><Loader2 className="h-5 w-5 animate-spin text-sky-700" /><span className="text-sm font-semibold text-slate-700">{label}</span></div></div>;
}

function TableLoading() {
  return <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80"><div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold shadow-lg"><Loader2 className="h-4 w-4 animate-spin text-sky-700" />Loading approvals...</div></div>;
}

function Pagination({ page, loading, onPage }: { page: ApprovalsPage; loading: boolean; onPage: (page: number) => Promise<void> }) {
  return <div className="flex flex-col gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-500">Showing {page.records.length} of {page.total} / Page {page.page} of {page.totalPages}</p><div className="grid grid-cols-2 gap-2"><button type="button" disabled={!page.hasPreviousPage || loading} onClick={() => void onPage(page.page - 1)} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Previous</button><button type="button" disabled={!page.hasNextPage || loading} onClick={() => void onPage(page.page + 1)} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button></div></div>;
}
