"use client";

import {
  AlertTriangle,
  Archive,
  BatteryCharging,
  Box,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Edit3,
  Eye,
  Loader2,
  PackageCheck,
  Plus,
  Save,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  Upload,
  Wrench,
  X
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { useAppMessage } from "@/components/message-provider";
import { getSecureSession } from "@/lib/auth-api";
import {
  archiveInventoryAsset,
  fetchInventoryActivityPage,
  fetchInventoryAsset,
  fetchInventoryAssetsPage,
  fetchInventoryDashboard,
  fetchInventoryMasterData,
  saveInventoryAsset,
  saveInventoryMaintenance,
  saveInventoryMasterData,
  saveInventoryTransaction,
  type InventoryActivityPage,
  type InventoryAssetsPage
} from "@/lib/inventory-api";
import {
  createEmptyInventoryAsset,
  emptyInventoryMasterData,
  INVENTORY_AVAILABILITY_LABELS,
  INVENTORY_OPERATIONAL_LABELS,
  type InventoryActivity,
  type InventoryAsset,
  type InventoryAssetDetail,
  type InventoryAssetSummary,
  type InventoryAvailabilityStatus,
  type InventoryDashboard,
  type InventoryMaintenance,
  type InventoryMasterData,
  type InventoryMasterItem,
  type InventoryMasterSection,
  type InventoryOperationalStatus,
  type InventoryTransaction,
  type InventoryTransactionAction
} from "@/lib/inventory";

type PageMode = "assets" | "activity" | "masterData";

const inputClass =
  "mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-100 md:h-11 md:text-sm";

const emptyDashboard: InventoryDashboard = {
  totalAssets: 0,
  availableAssets: 0,
  checkedOutAssets: 0,
  underMaintenance: 0,
  notOperational: 0,
  damagedAssets: 0,
  overdueReturns: 0,
  inspectionsDue: 0,
  batteriesNearCycleLimit: 0
};

const emptyAssetPage: InventoryAssetsPage = {
  assets: [], page: 1, pageSize: 10, totalRecords: 0, totalPages: 1,
  hasPreviousPage: false, hasNextPage: false
};

const emptyActivityPage: InventoryActivityPage = {
  activities: [], page: 1, pageSize: 10, totalRecords: 0, totalPages: 1,
  hasPreviousPage: false, hasNextPage: false
};

const masterLabels: Record<InventoryMasterSection, string> = {
  equipmentTypes: "Equipment Types",
  storageLocations: "Storage Locations",
  conditions: "Item Conditions"
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function localDateTime() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-SG");
}

function statusTone(value: string) {
  if (["available", "operational", "completed", "good", "excellent", "new"].includes(value)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (["not_operational", "quarantined", "damaged", "unserviceable", "missing", "open"].includes(value)) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (["under_maintenance", "in_progress", "reserved"].includes(value)) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-slate-200 bg-slate-100 text-slate-600";
}

export default function InventoryPage() {
  const pathname = usePathname();
  const message = useAppMessage();
  const session = getSecureSession();
  const routeMode: PageMode = pathname.includes("/master-data")
    ? "masterData"
    : pathname.includes("/records")
      ? "activity"
      : "assets";
  const [mode, setMode] = useState<PageMode>(routeMode);
  const [masterData, setMasterData] = useState<InventoryMasterData>(
    emptyInventoryMasterData()
  );
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [assetPage, setAssetPage] = useState(emptyAssetPage);
  const [activityPage, setActivityPage] = useState(emptyActivityPage);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [working, setWorking] = useState("");
  const [query, setQuery] = useState("");
  const [equipmentType, setEquipmentType] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [operationalStatus, setOperationalStatus] = useState("");
  const [availabilityStatus, setAvailabilityStatus] = useState("");
  const [condition, setCondition] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [activityYear, setActivityYear] = useState("");
  const [assetForm, setAssetForm] = useState<InventoryAsset | null>(null);
  const [viewing, setViewing] = useState<InventoryAssetDetail | null>(null);
  const [movementAsset, setMovementAsset] = useState<InventoryAssetSummary | null>(null);
  const [transaction, setTransaction] = useState<InventoryTransaction | null>(null);
  const [maintenanceAsset, setMaintenanceAsset] = useState<InventoryAssetSummary | null>(null);
  const [maintenance, setMaintenance] = useState<InventoryMaintenance | null>(null);
  const [masterSection, setMasterSection] =
    useState<InventoryMasterSection>("equipmentTypes");
  const [newMasterValue, setNewMasterValue] = useState("");

  const activeMaster = useMemo(() => ({
    equipmentTypes: masterData.equipmentTypes.filter((item) => item.status === "active"),
    storageLocations: masterData.storageLocations.filter((item) => item.status === "active"),
    conditions: masterData.conditions.filter((item) => item.status === "active")
  }), [masterData]);

  const yearOptions = useMemo(() => {
    const year = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, index) => year - index);
  }, []);

  useEffect(() => setMode(routeMode), [routeMode]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      setLoading(true);
      try {
        const [master, stats, assets, activities] = await Promise.all([
          fetchInventoryMasterData(),
          fetchInventoryDashboard(),
          fetchInventoryAssetsPage({ page: 1, pageSize: 10 }),
          fetchInventoryActivityPage({ page: 1, pageSize: 10 })
        ]);
        if (!active) return;
        setMasterData(master);
        setDashboard(stats);
        setAssetPage(assets);
        setActivityPage(activities);
      } catch (error) {
        message.error(
          "Inventory could not be loaded",
          error instanceof Error ? error.message : "Please try again."
        );
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading || routeMode !== "assets") return;
    const timer = window.setTimeout(() => void loadAssets(1), 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, equipmentType, storageLocation, operationalStatus, availabilityStatus, condition, includeArchived, routeMode, loading]);

  useEffect(() => {
    if (loading || routeMode !== "activity") return;
    const timer = window.setTimeout(() => void loadActivities(1), 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activityYear, routeMode, loading]);

  async function loadAssets(page = assetPage.page) {
    setTableLoading(true);
    try {
      setAssetPage(await fetchInventoryAssetsPage({
        page, pageSize: 10, query, equipmentType, storageLocation,
        operationalStatus, availabilityStatus, condition, includeArchived
      }));
    } catch (error) {
      message.error("Inventory assets could not be loaded", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setTableLoading(false);
    }
  }

  async function loadActivities(page = activityPage.page) {
    setTableLoading(true);
    try {
      setActivityPage(await fetchInventoryActivityPage({
        page, pageSize: 10, query, year: activityYear
      }));
    } catch (error) {
      message.error("Inventory activity could not be loaded", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setTableLoading(false);
    }
  }

  async function refreshInventory() {
    const [stats] = await Promise.all([
      fetchInventoryDashboard(),
      loadAssets(assetPage.page),
      loadActivities(activityPage.page)
    ]);
    setDashboard(stats);
  }

  function openNewAsset() {
    setAssetForm(createEmptyInventoryAsset());
  }

  async function openAsset(assetId: string, edit = false) {
    setWorking("Loading inventory asset...");
    try {
      const detail = await fetchInventoryAsset(assetId);
      if (edit) setAssetForm(detail.asset);
      else setViewing(detail);
    } catch (error) {
      message.error("Asset could not be opened", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setWorking("");
    }
  }

  async function submitAsset() {
    if (!assetForm || working) return;
    if (!assetForm.equipmentType || !assetForm.storageLocation || !assetForm.condition) {
      message.warning("Complete the required fields", "Equipment Type, Storage Location, and Condition are required.");
      return;
    }
    setWorking("Saving inventory asset...");
    try {
      await saveInventoryAsset({ ...assetForm, updatedAt: new Date().toISOString() });
      setAssetForm(null);
      await refreshInventory();
      message.success("Inventory asset saved");
    } catch (error) {
      message.error("Inventory asset was not saved", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setWorking("");
    }
  }

  async function handlePhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 3 * 1024 * 1024) {
      message.warning("Invalid asset photo", "Use a PNG or JPG smaller than 3 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAssetForm((current) => current
      ? { ...current, photoDataUrl: String(reader.result || ""), removePhoto: false }
      : current);
    reader.readAsDataURL(file);
  }

  async function archiveAsset(asset: InventoryAssetSummary) {
    const confirmed = await message.confirm({
      title: "Archive inventory asset?",
      message: `${asset.assetTag} will be retired and hidden from the active register.`,
      confirmLabel: "Archive asset",
      variant: "danger"
    });
    if (!confirmed) return;
    setWorking("Archiving inventory asset...");
    try {
      await archiveInventoryAsset(asset.id);
      await refreshInventory();
      message.success("Inventory asset archived");
    } catch (error) {
      message.error("Asset was not archived", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setWorking("");
    }
  }

  function openMovement(asset: InventoryAssetSummary) {
    const action: InventoryTransactionAction = asset.availabilityStatus === "checked_out"
      ? "return"
      : "check_out";
    setMovementAsset(asset);
    setTransaction({
      id: crypto.randomUUID(), assetId: asset.id, assetTag: asset.assetTag,
      action, issuedTo: action === "return" ? asset.assignedTo : "", activity: "",
      fromLocation: asset.storageLocation, toLocation: action === "return" ? asset.storageLocation : "",
      checkoutAt: localDateTime(), expectedReturnAt: "", returnedAt: action === "return" ? localDateTime() : "",
      conditionBefore: asset.condition, conditionAfter: action === "return" ? asset.condition : "",
      performedByName: session?.name || "", performedByEmail: session?.email || "",
      remarks: "", createdAt: new Date().toISOString()
    });
  }

  async function submitMovement() {
    if (!transaction || working) return;
    setWorking("Saving inventory movement...");
    try {
      await saveInventoryTransaction(transaction);
      setTransaction(null);
      setMovementAsset(null);
      await refreshInventory();
      message.success("Inventory movement saved");
    } catch (error) {
      message.error("Inventory movement was not saved", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setWorking("");
    }
  }

  function openMaintenance(asset: InventoryAssetSummary) {
    const now = new Date().toISOString();
    setMaintenanceAsset(asset);
    setMaintenance({
      id: crypto.randomUUID(), assetId: asset.id, assetTag: asset.assetTag,
      type: "defect", reportedDate: today(), completedDate: "", status: "open",
      defectDescription: "", correctiveAction: "", inspectedBy: session?.name || "",
      performedBy: "", returnToServiceDate: "", documentDataUrl: "",
      documentName: "", remarks: "", createdAt: now, updatedAt: now
    });
  }

  function editMaintenanceRecord(record: InventoryMaintenance) {
    if (!viewing) return;
    setMaintenanceAsset({
      ...viewing.asset,
      hasPhoto: Boolean(viewing.asset.photoDataUrl),
      openMaintenanceCount: viewing.maintenance.filter(
        (item) => item.status !== "completed"
      ).length
    });
    setMaintenance({ ...record });
    setViewing(null);
  }

  async function handleDocument(file?: File) {
    if (!file || !maintenance) return;
    if (file.size > 5 * 1024 * 1024) {
      message.warning("Attachment is too large", "Use a PDF or image smaller than 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setMaintenance((current) => current
      ? { ...current, documentDataUrl: String(reader.result || ""), documentName: file.name }
      : current);
    reader.readAsDataURL(file);
  }

  async function submitMaintenance() {
    if (!maintenance || working) return;
    setWorking("Saving maintenance record...");
    try {
      await saveInventoryMaintenance({ ...maintenance, updatedAt: new Date().toISOString() });
      setMaintenance(null);
      setMaintenanceAsset(null);
      await refreshInventory();
      message.success("Maintenance record saved");
    } catch (error) {
      message.error("Maintenance record was not saved", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setWorking("");
    }
  }

  function addMasterItem() {
    const value = newMasterValue.trim();
    if (!value) return;
    if (masterData[masterSection].some((item) => item.value.toLowerCase() === value.toLowerCase())) {
      message.warning("Duplicate value", "This Inventory Master Data value already exists.");
      return;
    }
    const sortOrder = Math.max(0, ...masterData[masterSection].map((item) => item.sortOrder)) + 1;
    setMasterData((current) => ({
      ...current,
      [masterSection]: [
        ...current[masterSection],
        { id: crypto.randomUUID(), value, sortOrder, status: "active" }
      ]
    }));
    setNewMasterValue("");
  }

  function updateMasterItem(id: string, patch: Partial<InventoryMasterItem>) {
    setMasterData((current) => ({
      ...current,
      [masterSection]: current[masterSection].map((item) => item.id === id
        ? { ...item, ...patch }
        : item)
    }));
  }

  async function removeMasterItem(item: InventoryMasterItem) {
    const confirmed = await message.confirm({
      title: "Delete Inventory Master Data?",
      message: "Existing assets retain their saved value, but it will no longer be available for new entries.",
      confirmLabel: "Delete value",
      variant: "danger"
    });
    if (confirmed) {
      setMasterData((current) => ({
        ...current,
        [masterSection]: current[masterSection].filter((entry) => entry.id !== item.id)
      }));
    }
  }

  async function submitMasterData() {
    setWorking("Saving Inventory Master Data...");
    try {
      setMasterData(await saveInventoryMasterData(masterData));
      message.success("Inventory Master Data saved");
    } catch (error) {
      message.error("Inventory Master Data was not saved", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setWorking("");
    }
  }

  if (loading) {
    return <AppShell><CenteredLoading label="Loading Inventory..." /></AppShell>;
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-sky-700">
              <Box className="h-4 w-4" /> Equipment Control
            </div>
            <h1 className="mt-2 text-2xl font-bold text-slate-800 sm:text-3xl">
              {mode === "activity" ? "Inventory Activity" : mode === "masterData" ? "Inventory Data" : "Inventory"}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {mode === "activity"
                ? "Review equipment movements, defects, inspections, and maintenance."
                : mode === "masterData"
                  ? "Manage controlled equipment types, locations, and conditions."
                  : "Monitor, issue, maintain, and account for UATO training equipment."}
            </p>
          </div>
          {mode === "assets" ? (
            <button type="button" onClick={openNewAsset} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 lg:h-11">
              <Plus className="h-4 w-4" /> Add asset
            </button>
          ) : null}
        </header>

        {mode === "assets" ? (
          <>
            <DashboardGrid dashboard={dashboard} />
            <section>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_180px_160px_160px]">
                <label className="relative sm:col-span-2 xl:col-span-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input className={`${inputClass} mt-0 pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tag, model, serial, or assignee" />
                </label>
                <FilterSelect value={equipmentType} onChange={setEquipmentType} emptyLabel="All equipment types" options={activeMaster.equipmentTypes.map((item) => item.value)} />
                <FilterSelect value={storageLocation} onChange={setStorageLocation} emptyLabel="All locations" options={activeMaster.storageLocations.map((item) => item.value)} />
                <FilterSelect value={operationalStatus} onChange={setOperationalStatus} emptyLabel="All operations" options={Object.entries(INVENTORY_OPERATIONAL_LABELS)} />
                <FilterSelect value={availabilityStatus} onChange={setAvailabilityStatus} emptyLabel="All availability" options={Object.entries(INVENTORY_AVAILABILITY_LABELS)} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <FilterSelect value={condition} onChange={setCondition} emptyLabel="All conditions" options={activeMaster.conditions.map((item) => item.value)} compact />
                <label className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
                  Include archived
                </label>
                <button type="button" onClick={() => { setQuery(""); setEquipmentType(""); setStorageLocation(""); setOperationalStatus(""); setAvailabilityStatus(""); setCondition(""); setIncludeArchived(false); }} className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700">
                  <X className="h-4 w-4" /> Clear
                </button>
              </div>
              <AssetRegister
                page={assetPage}
                loading={tableLoading}
                onPage={loadAssets}
                onView={(id) => void openAsset(id)}
                onEdit={(id) => void openAsset(id, true)}
                onMove={openMovement}
                onMaintenance={openMaintenance}
                onArchive={(asset) => void archiveAsset(asset)}
              />
            </section>
          </>
        ) : null}

        {mode === "activity" ? (
          <ActivityRegister
            page={activityPage}
            loading={tableLoading}
            query={query}
            setQuery={setQuery}
            year={activityYear}
            setYear={setActivityYear}
            years={yearOptions}
            onPage={loadActivities}
            onViewAsset={(id) => void openAsset(id)}
          />
        ) : null}

        {mode === "masterData" ? (
          <MasterDataPanel
            data={masterData}
            section={masterSection}
            setSection={setMasterSection}
            newValue={newMasterValue}
            setNewValue={setNewMasterValue}
            onAdd={addMasterItem}
            onUpdate={updateMasterItem}
            onRemove={(item) => void removeMasterItem(item)}
            onSave={() => void submitMasterData()}
          />
        ) : null}
      </div>

      {assetForm ? <AssetModal asset={assetForm} setAsset={setAssetForm} master={activeMaster} onClose={() => setAssetForm(null)} onSave={() => void submitAsset()} onPhoto={(file) => void handlePhoto(file)} /> : null}
      {viewing ? <AssetDetailModal detail={viewing} onClose={() => setViewing(null)} onEditMaintenance={editMaintenanceRecord} /> : null}
      {transaction && movementAsset ? <MovementModal asset={movementAsset} value={transaction} setValue={setTransaction} locations={activeMaster.storageLocations.map((item) => item.value)} conditions={activeMaster.conditions.map((item) => item.value)} onClose={() => { setTransaction(null); setMovementAsset(null); }} onSave={() => void submitMovement()} /> : null}
      {maintenance && maintenanceAsset ? <MaintenanceModal asset={maintenanceAsset} value={maintenance} setValue={setMaintenance} onClose={() => { setMaintenance(null); setMaintenanceAsset(null); }} onSave={() => void submitMaintenance()} onDocument={(file) => void handleDocument(file)} /> : null}
      {working ? <WorkingOverlay label={working} /> : null}
    </AppShell>
  );
}

function DashboardGrid({ dashboard }: { dashboard: InventoryDashboard }) {
  const cards = [
    ["Total Assets", dashboard.totalAssets, Box, "text-sky-700 bg-sky-50"],
    ["Available", dashboard.availableAssets, PackageCheck, "text-emerald-700 bg-emerald-50"],
    ["Checked Out", dashboard.checkedOutAssets, Send, "text-indigo-700 bg-indigo-50"],
    ["Maintenance", dashboard.underMaintenance, Wrench, "text-amber-700 bg-amber-50"],
    ["Not Operational", dashboard.notOperational, ShieldAlert, "text-rose-700 bg-rose-50"],
    ["Overdue", dashboard.overdueReturns, AlertTriangle, "text-red-700 bg-red-50"],
    ["Inspections Due", dashboard.inspectionsDue, ClipboardCheck, "text-violet-700 bg-violet-50"],
    ["Battery Cycle Alert", dashboard.batteriesNearCycleLimit, BatteryCharging, "text-cyan-700 bg-cyan-50"]
  ] as const;
  return <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">{cards.map(([label, value, Icon, tone]) => <div key={label} className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}><Icon className="h-4 w-4" /></div><p className="mt-4 text-2xl font-bold text-slate-950">{value}</p><p className="mt-1 text-xs font-semibold text-slate-500">{label}</p></div>)}</section>;
}

function AssetRegister({ page, loading, onPage, onView, onEdit, onMove, onMaintenance, onArchive }: { page: InventoryAssetsPage; loading: boolean; onPage: (page: number) => Promise<void>; onView: (id: string) => void; onEdit: (id: string) => void; onMove: (asset: InventoryAssetSummary) => void; onMaintenance: (asset: InventoryAssetSummary) => void; onArchive: (asset: InventoryAssetSummary) => void }) {
  return <div className="relative mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"><div className="divide-y divide-slate-200 lg:hidden">{page.assets.map((asset) => <article key={asset.id} className="p-4"><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700"><Box className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="font-bold text-slate-950">{asset.assetTag}</p><p className="truncate text-sm text-slate-600">{asset.brand} {asset.model}</p><p className="mt-1 text-xs text-slate-500">{asset.equipmentType} / {asset.storageLocation}</p></div><StatusBadge value={asset.availabilityStatus} label={INVENTORY_AVAILABILITY_LABELS[asset.availabilityStatus]} /></div><div className="mt-4 flex flex-wrap justify-end gap-2"><IconButton label="View asset" icon={Eye} onClick={() => onView(asset.id)} /><IconButton label="Edit asset" icon={Edit3} onClick={() => onEdit(asset.id)} /><IconButton label="Move asset" icon={Send} onClick={() => onMove(asset)} /><IconButton label="Maintenance" icon={Wrench} onClick={() => onMaintenance(asset)} /><IconButton label="Archive asset" icon={Archive} danger onClick={() => onArchive(asset)} /></div></article>)}{!page.assets.length && !loading ? <EmptyState label="No inventory assets found." /> : null}</div><div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[1180px] text-left text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><Th>Asset</Th><Th>Type</Th><Th>Serial / UA ID</Th><Th>Location</Th><Th>Operational</Th><Th>Availability</Th><Th>Condition</Th><Th right>Actions</Th></tr></thead><tbody>{page.assets.map((asset) => <tr key={asset.id} className="border-b border-slate-100 hover:bg-slate-50/70"><Td><div className="flex items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700"><Box className="h-5 w-5" /></div><div><p className="font-bold text-slate-950">{asset.assetTag}</p><p className="text-xs text-slate-500">{asset.brand} {asset.model}</p></div></div></Td><Td>{asset.equipmentType}</Td><Td><p>{asset.serialNumber || "-"}</p><p className="text-xs text-slate-500">{asset.uaRegistrationId || ""}</p></Td><Td>{asset.storageLocation}<span className="block text-xs text-slate-500">{asset.storageDetail}</span></Td><Td><StatusBadge value={asset.operationalStatus} label={INVENTORY_OPERATIONAL_LABELS[asset.operationalStatus]} /></Td><Td><StatusBadge value={asset.availabilityStatus} label={INVENTORY_AVAILABILITY_LABELS[asset.availabilityStatus]} /></Td><Td><StatusBadge value={asset.condition.toLowerCase()} label={asset.condition} /></Td><Td><div className="flex justify-end gap-2"><IconButton label="View asset" icon={Eye} onClick={() => onView(asset.id)} /><IconButton label="Edit asset" icon={Edit3} onClick={() => onEdit(asset.id)} /><IconButton label="Check out, return, or transfer" icon={Send} onClick={() => onMove(asset)} /><IconButton label="Record maintenance" icon={Wrench} onClick={() => onMaintenance(asset)} /><IconButton label="Archive asset" icon={Archive} danger onClick={() => onArchive(asset)} /></div></Td></tr>)}{!page.assets.length && !loading ? <tr><td colSpan={8}><EmptyState label="No inventory assets found." /></td></tr> : null}</tbody></table></div>{loading ? <TableLoading label="Loading assets..." /> : null}<Pagination page={page.page} totalPages={page.totalPages} totalRecords={page.totalRecords} count={page.assets.length} previous={page.hasPreviousPage} next={page.hasNextPage} loading={loading} onPage={onPage} /></div>;
}

function ActivityRegister({ page, loading, query, setQuery, year, setYear, years, onPage, onViewAsset }: { page: InventoryActivityPage; loading: boolean; query: string; setQuery: (value: string) => void; year: string; setYear: (value: string) => void; years: number[]; onPage: (page: number) => Promise<void>; onViewAsset: (id: string) => void }) {
  return <section><div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_160px_auto]"><label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} mt-0 pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search asset, action, or person" /></label><select className={`${inputClass} mt-0`} value={year} onChange={(event) => setYear(event.target.value)}><option value="">All years</option>{years.map((item) => <option key={item}>{item}</option>)}</select><button type="button" onClick={() => { setQuery(""); setYear(""); }} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 md:h-11"><X className="h-4 w-4" /> Clear</button></div><div className="relative mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><Th>Asset</Th><Th>Activity</Th><Th>Type</Th><Th>Status</Th><Th>Performed By</Th><Th>Date</Th><Th right>Action</Th></tr></thead><tbody>{page.activities.map((item) => <ActivityRow key={`${item.activityType}-${item.id}`} item={item} onView={() => onViewAsset(item.assetId)} />)}{!page.activities.length && !loading ? <tr><td colSpan={7}><EmptyState label="No inventory activity found." /></td></tr> : null}</tbody></table></div>{loading ? <TableLoading label="Loading activity..." /> : null}<Pagination page={page.page} totalPages={page.totalPages} totalRecords={page.totalRecords} count={page.activities.length} previous={page.hasPreviousPage} next={page.hasNextPage} loading={loading} onPage={onPage} /></div></section>;
}

function ActivityRow({ item, onView }: { item: InventoryActivity; onView: () => void }) {
  return <tr className="border-b border-slate-100"><Td><span className="font-bold text-slate-950">{item.assetTag}</span></Td><Td><p className="max-w-sm truncate font-medium">{item.title}</p><p className="max-w-sm truncate text-xs text-slate-500">{item.remarks}</p></Td><Td><span className="capitalize">{item.activityType}</span></Td><Td><StatusBadge value={item.status} label={item.status.replace(/_/g, " ")} /></Td><Td>{item.performedBy || "-"}</Td><Td>{formatDateTime(item.activityDate)}</Td><Td><div className="flex justify-end"><IconButton label="View asset" icon={Eye} onClick={onView} /></div></Td></tr>;
}

function MasterDataPanel({ data, section, setSection, newValue, setNewValue, onAdd, onUpdate, onRemove, onSave }: { data: InventoryMasterData; section: InventoryMasterSection; setSection: (section: InventoryMasterSection) => void; newValue: string; setNewValue: (value: string) => void; onAdd: () => void; onUpdate: (id: string, patch: Partial<InventoryMasterItem>) => void; onRemove: (item: InventoryMasterItem) => void; onSave: () => void }) {
  return <section><div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="text-xl font-bold text-slate-950">Inventory Master Data</h2><p className="text-sm text-slate-500">Inactive values remain on existing assets but cannot be selected for new assets.</p></div><button type="button" onClick={onSave} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white"><Save className="h-4 w-4" /> Save Master Data</button></div><div className="mt-5 grid grid-cols-3 gap-2">{(["equipmentTypes", "storageLocations", "conditions"] as InventoryMasterSection[]).map((item) => <button key={item} type="button" onClick={() => setSection(item)} className={`rounded-lg border px-3 py-3 text-sm font-semibold ${section === item ? "border-sky-700 bg-sky-50 text-sky-900 ring-1 ring-sky-700" : "border-slate-200 bg-white text-slate-600"}`}><span className="block truncate">{masterLabels[item]}</span><span className="mt-1 block text-xs font-normal">{data[item].length} values</span></button>)}</div><div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_auto]"><input className="h-12 rounded-lg border border-slate-300 px-3 text-sm" value={newValue} onChange={(event) => setNewValue(event.target.value)} placeholder={`Add ${masterLabels[section]}`} /><button type="button" onClick={onAdd} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Add value</button></div><div className="mt-4 space-y-2">{data[section].slice().sort((a, b) => a.sortOrder - b.sortOrder).map((item, index) => <div key={item.id} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[40px_minmax(0,1fr)_120px_auto] sm:items-center"><span className="text-sm font-bold text-slate-400">{index + 1}</span><input className="h-11 rounded-lg border border-slate-300 px-3 text-sm" value={item.value} onChange={(event) => onUpdate(item.id, { value: event.target.value })} /><button type="button" onClick={() => onUpdate(item.id, { status: item.status === "active" ? "inactive" : "active" })} className={`h-10 rounded-lg border px-3 text-xs font-bold ${item.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}>{item.status === "active" ? "Active" : "Inactive"}</button><IconButton label="Delete value" icon={Trash2} danger onClick={() => onRemove(item)} /></div>)}</div></section>;
}

function AssetModal({ asset, setAsset, master, onClose, onSave, onPhoto }: { asset: InventoryAsset; setAsset: (asset: InventoryAsset | null) => void; master: InventoryMasterData; onClose: () => void; onSave: () => void; onPhoto: (file?: File) => void }) {
  const patch = (changes: Partial<InventoryAsset>) => setAsset({ ...asset, ...changes });
  const isBattery = asset.equipmentType === "UA - Battery";
  return <Modal title={asset.assetTag || "New Inventory Asset"} subtitle="Asset Register" onClose={onClose} footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton onClick={onSave}><Save className="h-4 w-4" /> Save asset</PrimaryButton></>}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Field label="Asset Tag"><input className={inputClass} value={asset.assetTag} onChange={(event) => patch({ assetTag: event.target.value })} placeholder="Generated automatically if blank" /></Field><Field label="Equipment Type *"><Select className={inputClass} value={asset.equipmentType} onChange={(value) => patch({ equipmentType: value })} empty="Select equipment type" options={master.equipmentTypes.map((item) => item.value)} /></Field><Field label="Date Added"><input type="date" className={inputClass} value={asset.dateAdded} max={today()} onChange={(event) => patch({ dateAdded: event.target.value })} /></Field><Field label="Brand"><input className={inputClass} value={asset.brand} onChange={(event) => patch({ brand: event.target.value })} /></Field><Field label="Model"><input className={inputClass} value={asset.model} onChange={(event) => patch({ model: event.target.value })} /></Field><Field label="Serial Number"><input className={inputClass} value={asset.serialNumber} onChange={(event) => patch({ serialNumber: event.target.value })} /></Field><Field label="UA Registration / Internal ID"><input className={inputClass} value={asset.uaRegistrationId} onChange={(event) => patch({ uaRegistrationId: event.target.value })} /></Field><Field label="Quantity"><input type="number" min={1} className={inputClass} value={asset.quantity} onChange={(event) => patch({ quantity: Number(event.target.value) || 1 })} /></Field><Field label="Storage Location *"><Select className={inputClass} value={asset.storageLocation} onChange={(value) => patch({ storageLocation: value })} empty="Select location" options={master.storageLocations.map((item) => item.value)} /></Field><Field label="Cabinet / Shelf / Container"><input className={inputClass} value={asset.storageDetail} onChange={(event) => patch({ storageDetail: event.target.value })} /></Field><Field label="Operational Status"><Select className={inputClass} value={asset.operationalStatus} onChange={(value) => patch({ operationalStatus: value as InventoryOperationalStatus })} options={Object.entries(INVENTORY_OPERATIONAL_LABELS)} /></Field><Field label="Availability"><Select className={inputClass} value={asset.availabilityStatus} onChange={(value) => patch({ availabilityStatus: value as InventoryAvailabilityStatus })} options={Object.entries(INVENTORY_AVAILABILITY_LABELS)} /></Field><Field label="Condition *"><Select className={inputClass} value={asset.condition} onChange={(value) => patch({ condition: value })} empty="Select condition" options={master.conditions.map((item) => item.value)} /></Field><Field label="Assigned To"><input className={inputClass} value={asset.assignedTo} onChange={(event) => patch({ assignedTo: event.target.value })} /></Field><Field label="Last Inspection"><input type="date" className={inputClass} value={asset.lastInspectionDate} max={today()} onChange={(event) => patch({ lastInspectionDate: event.target.value })} /></Field><Field label="Next Inspection Due"><input type="date" className={inputClass} value={asset.nextInspectionDue} onChange={(event) => patch({ nextInspectionDue: event.target.value })} /></Field></div>{isBattery ? <section className="mt-6 border-t border-slate-200 pt-5"><div className="flex items-center gap-2"><BatteryCharging className="h-5 w-5 text-cyan-700" /><h3 className="font-bold text-slate-950">Battery Information</h3></div><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Chemistry"><input className={inputClass} value={asset.batteryChemistry} onChange={(event) => patch({ batteryChemistry: event.target.value })} placeholder="LiPo, Li-ion" /></Field><Field label="Capacity (mAh)"><input inputMode="numeric" className={inputClass} value={asset.batteryCapacityMah} onChange={(event) => patch({ batteryCapacityMah: event.target.value })} /></Field><Field label="Cell Count"><input inputMode="numeric" className={inputClass} value={asset.batteryCellCount} onChange={(event) => patch({ batteryCellCount: event.target.value })} /></Field><Field label="Current Cycles"><input type="number" min={0} className={inputClass} value={asset.batteryCycleCount} onChange={(event) => patch({ batteryCycleCount: Number(event.target.value) || 0 })} /></Field><Field label="Maximum Cycles"><input type="number" min={0} className={inputClass} value={asset.batteryMaxCycles} onChange={(event) => patch({ batteryMaxCycles: Number(event.target.value) || 0 })} /></Field><Field label="Health (%)"><input type="number" min={0} max={100} className={inputClass} value={asset.batteryHealthPercent} onChange={(event) => patch({ batteryHealthPercent: Number(event.target.value) || 0 })} /></Field></div></section> : null}<div className="mt-6 grid gap-5 lg:grid-cols-2"><Field label="Description"><textarea className="mt-2 min-h-28 w-full rounded-lg border border-slate-300 p-3 text-sm" value={asset.description} onChange={(event) => patch({ description: event.target.value })} /></Field><Field label="Remarks"><textarea className="mt-2 min-h-28 w-full rounded-lg border border-slate-300 p-3 text-sm" value={asset.remarks} onChange={(event) => patch({ remarks: event.target.value })} /></Field></div><div className="mt-5"><p className="text-sm font-semibold text-slate-800">Asset Photo</p>{asset.photoDataUrl ? <div className="mt-2 flex min-h-36 items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3"><img src={asset.photoDataUrl} alt="Inventory asset" className="max-h-36 max-w-[80%] object-contain" /><IconButton label="Remove photo" icon={X} danger onClick={() => patch({ photoDataUrl: "", removePhoto: true })} /></div> : <label className="mt-2 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white"><Upload className="h-5 w-5 text-sky-700" /><span className="mt-2 text-sm font-semibold">Upload asset photo</span><span className="text-xs text-slate-500">PNG or JPG, maximum 3 MB</span><input type="file" accept="image/*" className="sr-only" onChange={(event) => onPhoto(event.target.files?.[0])} /></label>}</div></Modal>;
}

function MovementModal({ asset, value, setValue, locations, conditions, onClose, onSave }: { asset: InventoryAssetSummary; value: InventoryTransaction; setValue: (value: InventoryTransaction | null) => void; locations: string[]; conditions: string[]; onClose: () => void; onSave: () => void }) {
  const patch = (changes: Partial<InventoryTransaction>) => setValue({ ...value, ...changes });
  return <Modal title={asset.assetTag} subtitle="Equipment Movement" onClose={onClose} small footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton onClick={onSave}><Save className="h-4 w-4" /> Save movement</PrimaryButton></>}><div className="grid gap-4 sm:grid-cols-2"><Field label="Action"><Select className={inputClass} value={value.action} onChange={(action) => patch({ action: action as InventoryTransactionAction, returnedAt: action === "return" ? localDateTime() : "" })} options={[["check_out", "Check Out"], ["return", "Return"], ["transfer", "Transfer"], ["reserve", "Reserve"], ["retire", "Retire"]]} /></Field><Field label="Issued To"><input className={inputClass} value={value.issuedTo} onChange={(event) => patch({ issuedTo: event.target.value })} /></Field><Field label="Training Course / Activity"><input className={inputClass} value={value.activity} onChange={(event) => patch({ activity: event.target.value })} /></Field><Field label="Destination Location"><Select className={inputClass} value={value.toLocation} onChange={(toLocation) => patch({ toLocation })} empty="Select destination" options={locations} /></Field><Field label="Checkout / Action Time"><input type="datetime-local" className={inputClass} value={value.checkoutAt.slice(0, 16)} onChange={(event) => patch({ checkoutAt: event.target.value })} /></Field><Field label="Expected Return"><input type="datetime-local" className={inputClass} value={value.expectedReturnAt.slice(0, 16)} onChange={(event) => patch({ expectedReturnAt: event.target.value })} /></Field><Field label="Condition Before"><Select className={inputClass} value={value.conditionBefore} onChange={(conditionBefore) => patch({ conditionBefore })} options={conditions} /></Field>{value.action === "return" ? <Field label="Condition After Return"><Select className={inputClass} value={value.conditionAfter} onChange={(conditionAfter) => patch({ conditionAfter })} options={conditions} /></Field> : null}</div><Field label="Remarks"><textarea className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 p-3 text-sm" value={value.remarks} onChange={(event) => patch({ remarks: event.target.value })} /></Field></Modal>;
}

function MaintenanceModal({ asset, value, setValue, onClose, onSave, onDocument }: { asset: InventoryAssetSummary; value: InventoryMaintenance; setValue: (value: InventoryMaintenance | null) => void; onClose: () => void; onSave: () => void; onDocument: (file?: File) => void }) {
  const patch = (changes: Partial<InventoryMaintenance>) => setValue({ ...value, ...changes });
  return <Modal title={asset.assetTag} subtitle="Defect, Inspection, or Maintenance" onClose={onClose} footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton onClick={onSave}><Save className="h-4 w-4" /> Save record</PrimaryButton></>}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Record Type"><Select className={inputClass} value={value.type} onChange={(type) => patch({ type: type as InventoryMaintenance["type"] })} options={[["defect", "Defect"], ["inspection", "Inspection"], ["maintenance", "Maintenance"]]} /></Field><Field label="Status"><Select className={inputClass} value={value.status} onChange={(status) => patch({ status: status as InventoryMaintenance["status"] })} options={[["open", "Open"], ["in_progress", "In Progress"], ["completed", "Completed"]]} /></Field><Field label="Reported Date"><input type="date" className={inputClass} value={value.reportedDate} max={today()} onChange={(event) => patch({ reportedDate: event.target.value })} /></Field><Field label="Completed Date"><input type="date" className={inputClass} value={value.completedDate} max={today()} onChange={(event) => patch({ completedDate: event.target.value })} /></Field><Field label="Inspected By"><input className={inputClass} value={value.inspectedBy} onChange={(event) => patch({ inspectedBy: event.target.value })} /></Field><Field label="Maintenance Performed By"><input className={inputClass} value={value.performedBy} onChange={(event) => patch({ performedBy: event.target.value })} /></Field><Field label="Return to Service Date"><input type="date" className={inputClass} value={value.returnToServiceDate} max={today()} onChange={(event) => patch({ returnToServiceDate: event.target.value })} /></Field></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><Field label="Defect / Inspection Findings"><textarea className="mt-2 min-h-28 w-full rounded-lg border border-slate-300 p-3 text-sm" value={value.defectDescription} onChange={(event) => patch({ defectDescription: event.target.value })} /></Field><Field label="Corrective Action"><textarea className="mt-2 min-h-28 w-full rounded-lg border border-slate-300 p-3 text-sm" value={value.correctiveAction} onChange={(event) => patch({ correctiveAction: event.target.value })} /></Field></div><Field label="Remarks"><textarea className="mt-2 min-h-20 w-full rounded-lg border border-slate-300 p-3 text-sm" value={value.remarks} onChange={(event) => patch({ remarks: event.target.value })} /></Field><label className="mt-4 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white"><Upload className="h-5 w-5 text-sky-700" /><span className="mt-2 text-sm font-semibold">{value.documentName || "Upload supporting document"}</span><span className="text-xs text-slate-500">PDF or image, maximum 5 MB</span><input type="file" accept="application/pdf,image/*" className="sr-only" onChange={(event) => onDocument(event.target.files?.[0])} /></label></Modal>;
}

function AssetDetailModal({ detail, onClose, onEditMaintenance }: { detail: InventoryAssetDetail; onClose: () => void; onEditMaintenance: (record: InventoryMaintenance) => void }) {
  const asset = detail.asset;
  return <Modal title={asset.assetTag} subtitle={`${asset.equipmentType} / ${asset.brand} ${asset.model}`} onClose={onClose} footer={<SecondaryButton onClick={onClose}>Close</SecondaryButton>}><div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">{asset.photoDataUrl ? <img src={asset.photoDataUrl} alt={asset.assetTag} className="h-48 w-full rounded-lg border border-slate-200 object-contain" /> : <div className="flex h-48 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400"><Box className="h-10 w-10" /></div>}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Detail label="Serial Number" value={asset.serialNumber} /><Detail label="UA / Internal ID" value={asset.uaRegistrationId} /><Detail label="Location" value={`${asset.storageLocation} ${asset.storageDetail}`} /><Detail label="Operational" value={INVENTORY_OPERATIONAL_LABELS[asset.operationalStatus]} /><Detail label="Availability" value={INVENTORY_AVAILABILITY_LABELS[asset.availabilityStatus]} /><Detail label="Condition" value={asset.condition} /><Detail label="Assigned To" value={asset.assignedTo} /><Detail label="Next Inspection" value={formatDate(asset.nextInspectionDue)} /><Detail label="Quantity" value={String(asset.quantity)} /></div></div>{asset.equipmentType === "UA - Battery" ? <div className="mt-5 grid gap-3 rounded-lg bg-cyan-50 p-4 sm:grid-cols-3 lg:grid-cols-6"><Detail label="Chemistry" value={asset.batteryChemistry} /><Detail label="Capacity" value={asset.batteryCapacityMah ? `${asset.batteryCapacityMah} mAh` : ""} /><Detail label="Cells" value={asset.batteryCellCount} /><Detail label="Cycles" value={String(asset.batteryCycleCount)} /><Detail label="Max Cycles" value={String(asset.batteryMaxCycles)} /><Detail label="Health" value={`${asset.batteryHealthPercent}%`} /></div> : null}<HistorySection title="Movement History" empty="No movement history." items={detail.transactions.map((item) => ({ id: item.id, title: item.action.replace(/_/g, " "), subtitle: `${item.issuedTo || item.toLocation || "-"} / ${item.performedByName || "-"}`, date: item.createdAt, status: item.action }))} /><HistorySection title="Maintenance and Defects" empty="No maintenance history." items={detail.maintenance.map((item) => ({ id: item.id, title: item.defectDescription || item.type, subtitle: `${item.type} / ${item.performedBy || item.inspectedBy || "-"}`, date: item.updatedAt, status: item.status, onEdit: () => onEditMaintenance(item) }))} /></Modal>;
}

function HistorySection({ title, empty, items }: { title: string; empty: string; items: Array<{ id: string; title: string; subtitle: string; date: string; status: string; onEdit?: () => void }> }) {
  return <section className="mt-6"><h3 className="font-bold text-slate-950">{title}</h3><div className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">{items.map((item) => <div key={item.id} className="flex items-start gap-3 p-4"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-600" /><div className="min-w-0 flex-1"><p className="font-semibold capitalize text-slate-900">{item.title}</p><p className="text-xs text-slate-500">{item.subtitle}</p></div><div className="flex shrink-0 items-center gap-2"><div className="text-right"><StatusBadge value={item.status} label={item.status.replace(/_/g, " ")} /><p className="mt-1 text-xs text-slate-500">{formatDateTime(item.date)}</p></div>{item.onEdit ? <IconButton label="Edit maintenance record" icon={Edit3} onClick={item.onEdit} /> : null}</div></div>)}{!items.length ? <EmptyState label={empty} /> : null}</div></section>;
}

function Modal({ title, subtitle, onClose, children, footer, small = false }: { title: string; subtitle: string; onClose: () => void; children: ReactNode; footer: ReactNode; small?: boolean }) {
  return <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-5"><button type="button" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" onClick={onClose} aria-label="Close dialog" /><div className={`relative flex max-h-[95dvh] w-full flex-col overflow-hidden rounded-t-lg border border-slate-200 bg-white shadow-2xl sm:rounded-lg ${small ? "sm:max-w-3xl" : "sm:max-w-6xl"}`}><header className="flex items-start justify-between gap-4 border-b border-sky-100 bg-sky-50 p-4 sm:px-6"><div className="min-w-0"><p className="text-xs font-bold uppercase text-sky-700">{subtitle}</p><h2 className="mt-1 truncate text-xl font-bold text-slate-800">{title}</h2></div><IconButton label="Close" icon={X} onClick={onClose} /></header><div className="overflow-y-auto p-4 text-slate-700 sm:p-6">{children}</div><footer className="grid grid-cols-2 gap-2 border-t border-slate-200 bg-slate-50 p-4 sm:flex sm:justify-end">{footer}</footer></div></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-sm font-semibold text-slate-600">{label}{children}</label>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-[11px] font-bold uppercase text-sky-700">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-700">{value || "-"}</p></div>; }
function Select({ className, value, onChange, options, empty }: { className: string; value: string; onChange: (value: string) => void; options: string[] | Array<[string, string]>; empty?: string }) { return <select className={className} value={value} onChange={(event) => onChange(event.target.value)}>{empty ? <option value="">{empty}</option> : null}{options.map((option) => { const pair = Array.isArray(option) ? option : [option, option]; return <option key={pair[0]} value={pair[0]}>{pair[1]}</option>; })}</select>; }
function FilterSelect({ value, onChange, emptyLabel, options, compact = false }: { value: string; onChange: (value: string) => void; emptyLabel: string; options: string[] | Array<[string, string]>; compact?: boolean }) { return <select className={`${compact ? "h-11 min-w-44" : "h-12 md:h-11"} rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700`} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{emptyLabel}</option>{options.map((option) => { const pair = Array.isArray(option) ? option : [option, option]; return <option key={pair[0]} value={pair[0]}>{pair[1]}</option>; })}</select>; }
function StatusBadge({ value, label }: { value: string; label: string }) { return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${statusTone(value.toLowerCase())}`}>{label}</span>; }
function IconButton({ label, icon: Icon, onClick, danger = false }: { label: string; icon: typeof Eye; onClick: () => void; danger?: boolean }) { return <button type="button" onClick={onClick} title={label} aria-label={label} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition ${danger ? "border-rose-200 text-rose-600 hover:bg-rose-50" : "border-slate-200 text-slate-600 hover:bg-slate-100"}`}><Icon className="h-4 w-4" /></button>; }
function PrimaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) { return <button type="button" onClick={onClick} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-sky-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800">{children}</button>; }
function SecondaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) { return <button type="button" onClick={onClick} className="inline-flex h-12 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700">{children}</button>; }
function Th({ children, right = false }: { children: ReactNode; right?: boolean }) { return <th className={`px-4 py-3 font-semibold ${right ? "text-right" : ""}`}>{children}</th>; }
function Td({ children }: { children: ReactNode }) { return <td className="px-4 py-4 text-slate-700">{children}</td>; }
function EmptyState({ label }: { label: string }) { return <div className="px-5 py-12 text-center text-sm text-slate-500">{label}</div>; }
function CenteredLoading({ label }: { label: string }) { return <div className="flex min-h-[60vh] items-center justify-center"><div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-lg"><Loader2 className="h-5 w-5 animate-spin text-sky-700" /><span className="text-sm font-semibold text-slate-700">{label}</span></div></div>; }
function TableLoading({ label }: { label: string }) { return <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80"><div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold shadow-lg"><Loader2 className="h-4 w-4 animate-spin text-sky-700" />{label}</div></div>; }
function WorkingOverlay({ label }: { label: string }) { return <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"><div className="flex w-full max-w-sm items-center gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-2xl"><Loader2 className="h-5 w-5 animate-spin text-sky-700" /><div><p className="text-sm font-semibold text-slate-950">Please wait</p><p className="text-sm text-slate-500">{label}</p></div></div></div>; }
function Pagination({ page, totalPages, totalRecords, count, previous, next, loading, onPage }: { page: number; totalPages: number; totalRecords: number; count: number; previous: boolean; next: boolean; loading: boolean; onPage: (page: number) => Promise<void> }) { return <div className="flex flex-col gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-500">Showing {count} of {totalRecords} / Page {page} of {totalPages}</p><div className="grid grid-cols-2 gap-2"><button type="button" disabled={!previous || loading} onClick={() => void onPage(page - 1)} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Previous</button><button type="button" disabled={!next || loading} onClick={() => void onPage(page + 1)} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button></div></div>; }

