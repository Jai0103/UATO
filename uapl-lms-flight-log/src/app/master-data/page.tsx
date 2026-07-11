"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import { googleAppsScriptUrl } from "@/lib/google-api";
import {
  getMasterData,
  masterDataLabels,
  saveMasterData,
  type MasterData,
  type MasterDataKey
} from "@/lib/master-data";
import {
  BatteryCharging,
  Boxes,
  Check,
  CircleOff,
  Edit3,
  GraduationCap,
  MapPin,
  Plane,
  Plus,
  Search,
  Tag,
  Trash2,
  X
} from "lucide-react";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState
} from "react";

type ItemStatus = "active" | "inactive";

type CatalogItem = {
  id: string;
  value: string;
  status: ItemStatus;
};

type MasterDataCatalog = {
  sections: Record<
    MasterDataKey,
    CatalogItem[]
  >;
};

type StatusFilter =
  | "all"
  | "active"
  | "inactive";

type EditorState = {
  mode: "add" | "edit";
  section: MasterDataKey;
  itemId: string | null;
  value: string;
  status: ItemStatus;
};

const sections: {
  key: MasterDataKey;
  description: string;
  shortLabel: string;
  icon: typeof MapPin;
}[] = [
  {
    key: "locations",
    shortLabel: "Locations",
    description:
      "Training and operational locations available during flight entry.",
    icon: MapPin
  },
  {
    key: "batterySerialNumbers",
    shortLabel: "Batteries",
    description:
      "Battery serial numbers available as searchable flight suggestions.",
    icon: BatteryCharging
  },
  {
    key: "afeInstructors",
    shortLabel: "Instructors",
    description:
      "AFE and instructor reference accounts used in flight records.",
    icon: GraduationCap
  },
  {
    key: "uaModels",
    shortLabel: "UA Models",
    description:
      "UA model and serial number suggestions used during flight entry.",
    icon: Plane
  },
  {
    key: "uaCategories",
    shortLabel: "Categories",
    description:
      "UA category options available in the flight log form.",
    icon: Tag
  }
];

function createEmptyCatalog(): MasterDataCatalog {
  return {
    sections: {
      locations: [],
      batterySerialNumbers: [],
      afeInstructors: [],
      uaModels: [],
      uaCategories: []
    }
  };
}

function localMasterDataToCatalog(
  masterData: MasterData
): MasterDataCatalog {
  const catalog = createEmptyCatalog();

  (
    Object.keys(
      masterData
    ) as MasterDataKey[]
  ).forEach((section) => {
    catalog.sections[section] =
      masterData[section].map(
        (value, index) => ({
          id: `${section}-${index}-${value}`,
          value,
          status: "active"
        })
      );
  });

  return catalog;
}

function getActiveMasterData(
  catalog: MasterDataCatalog
): MasterData {
  return {
    locations:
      catalog.sections.locations
        .filter(
          (item) =>
            item.status === "active"
        )
        .map((item) => item.value),

    batterySerialNumbers:
      catalog.sections
        .batterySerialNumbers
        .filter(
          (item) =>
            item.status === "active"
        )
        .map((item) => item.value),

    afeInstructors:
      catalog.sections.afeInstructors
        .filter(
          (item) =>
            item.status === "active"
        )
        .map((item) => item.value),

    uaModels:
      catalog.sections.uaModels
        .filter(
          (item) =>
            item.status === "active"
        )
        .map((item) => item.value),

    uaCategories:
      catalog.sections.uaCategories
        .filter(
          (item) =>
            item.status === "active"
        )
        .map((item) => item.value)
  };
}

async function postCatalog(
  payload: Record<string, unknown>
) {
  const response = await fetch(
    googleAppsScriptUrl,
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    throw new Error(
      "Unable to reach Google Sheets."
    );
  }

  const result = await response.json();
  const successful =
    result.success ?? result.ok;

  if (!successful) {
    throw new Error(
      result.message ||
        result.error ||
        "Master Data request failed."
    );
  }

  return result;
}

function createItemId() {
  if (
    typeof crypto !== "undefined" &&
    "randomUUID" in crypto
  ) {
    return crypto.randomUUID();
  }

  return `item-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

export default function MasterDataPage() {
  const { notify, confirm } =
    useAppMessage();

  const [catalog, setCatalog] =
    useState<MasterDataCatalog | null>(
      null
    );

  const [activeSection, setActiveSection] =
    useState<MasterDataKey>(
      "locations"
    );

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");

  const [editor, setEditor] =
    useState<EditorState | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  useEffect(() => {
    async function loadCatalog() {
      setLoading(true);

      try {
        const result = await postCatalog({
          action:
            "getMasterDataCatalog"
        });

        const loadedCatalog =
          result.catalog as MasterDataCatalog;

        setCatalog(loadedCatalog);

        saveMasterData(
          getActiveMasterData(
            loadedCatalog
          )
        );
      } catch {
        const localCatalog =
          localMasterDataToCatalog(
            getMasterData()
          );

        setCatalog(localCatalog);

        notify({
          type: "warning",
          title:
            "Using local master data",
          message:
            "The catalog could not be loaded from Google Sheets."
        });
      } finally {
        setLoading(false);
      }
    }

    loadCatalog();
  }, [notify]);

  const selectedSection =
    sections.find(
      (section) =>
        section.key === activeSection
    ) ?? sections[0];

  const currentItems =
    catalog?.sections[activeSection] ??
    [];

  const filteredItems = useMemo(() => {
    const cleanQuery =
      query.trim().toLowerCase();

    return currentItems.filter(
      (item) => {
        const matchesSearch =
          !cleanQuery ||
          item.value
            .toLowerCase()
            .includes(cleanQuery);

        const matchesStatus =
          statusFilter === "all" ||
          item.status === statusFilter;

        return (
          matchesSearch &&
          matchesStatus
        );
      }
    );
  }, [
    currentItems,
    query,
    statusFilter
  ]);

  const totals = useMemo(() => {
    if (!catalog) {
      return {
        all: 0,
        active: 0,
        inactive: 0
      };
    }

    const allItems = Object.values(
      catalog.sections
    ).flat();

    return {
      all: allItems.length,
      active: allItems.filter(
        (item) =>
          item.status === "active"
      ).length,
      inactive: allItems.filter(
        (item) =>
          item.status === "inactive"
      ).length
    };
  }, [catalog]);

  async function persistCatalog(
    nextCatalog: MasterDataCatalog,
    successTitle: string,
    successMessage: string
  ) {
    if (!catalog || saving) return false;

    const previousCatalog = catalog;

    setCatalog(nextCatalog);
    setSaving(true);

    saveMasterData(
      getActiveMasterData(nextCatalog)
    );

    try {
      const result = await postCatalog({
        action:
          "saveMasterDataCatalog",
        catalog: nextCatalog
      });

      const savedCatalog =
        result.catalog as
          | MasterDataCatalog
          | undefined;

      if (savedCatalog) {
        setCatalog(savedCatalog);

        saveMasterData(
          getActiveMasterData(
            savedCatalog
          )
        );
      }

      notify({
        type: "success",
        title: successTitle,
        message: successMessage
      });

      return true;
    } catch (error) {
      setCatalog(previousCatalog);

      saveMasterData(
        getActiveMasterData(
          previousCatalog
        )
      );

      notify({
        type: "error",
        title:
          "Google Sheets sync failed",
        message:
          error instanceof Error
            ? error.message
            : "The changes were not saved."
      });

      return false;
    } finally {
      setSaving(false);
    }
  }

  function openAddEditor() {
    setEditor({
      mode: "add",
      section: activeSection,
      itemId: null,
      value: "",
      status: "active"
    });
  }

  function openEditEditor(
    item: CatalogItem
  ) {
    setEditor({
      mode: "edit",
      section: activeSection,
      itemId: item.id,
      value: item.value,
      status: item.status
    });
  }

  async function saveEditor(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!editor || !catalog) return;

    const cleanValue =
      editor.value.trim();

    if (!cleanValue) {
      notify({
        type: "warning",
        title: "Value required",
        message:
          "Enter a Master Data value."
      });
      return;
    }

    const sectionItems =
      catalog.sections[
        editor.section
      ];

    const duplicate =
      sectionItems.some(
        (item) =>
          item.id !== editor.itemId &&
          item.value
            .trim()
            .toLowerCase() ===
            cleanValue.toLowerCase()
      );

    if (duplicate) {
      notify({
        type: "warning",
        title: "Duplicate value",
        message: `"${cleanValue}" already exists in ${
          masterDataLabels[
            editor.section
          ]
        }.`
      });
      return;
    }

    const nextItems =
      editor.mode === "add"
        ? [
            ...sectionItems,
            {
              id: createItemId(),
              value: cleanValue,
              status: editor.status
            }
          ]
        : sectionItems.map((item) =>
            item.id === editor.itemId
              ? {
                  ...item,
                  value: cleanValue,
                  status:
                    editor.status
                }
              : item
          );

    nextItems.sort((a, b) =>
      a.value.localeCompare(b.value)
    );

    const nextCatalog = {
      ...catalog,
      sections: {
        ...catalog.sections,
        [editor.section]: nextItems
      }
    };

    const successful =
      await persistCatalog(
        nextCatalog,
        editor.mode === "add"
          ? "Value added"
          : "Value updated",
        `"${cleanValue}" was ${
          editor.mode === "add"
            ? "added to"
            : "updated in"
        } ${
          masterDataLabels[
            editor.section
          ]
        }.`
      );

    if (successful) {
      setEditor(null);
    }
  }

  async function toggleStatus(
    item: CatalogItem
  ) {
    if (!catalog) return;

    const nextStatus: ItemStatus =
      item.status === "active"
        ? "inactive"
        : "active";

    const nextCatalog = {
      ...catalog,
      sections: {
        ...catalog.sections,
        [activeSection]:
          catalog.sections[
            activeSection
          ].map((currentItem) =>
            currentItem.id === item.id
              ? {
                  ...currentItem,
                  status: nextStatus
                }
              : currentItem
          )
      }
    };

    await persistCatalog(
      nextCatalog,
      nextStatus === "active"
        ? "Value activated"
        : "Value deactivated",
      `"${item.value}" is now ${nextStatus}.`
    );
  }

  async function deleteItem(
    item: CatalogItem
  ) {
    if (!catalog) return;

    const approved = await confirm({
      title:
        "Delete Master Data value?",
      message: `Delete "${item.value}" from ${masterDataLabels[activeSection]}? Existing flight records will not be changed.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "danger"
    });

    if (!approved) return;

    const nextCatalog = {
      ...catalog,
      sections: {
        ...catalog.sections,
        [activeSection]:
          catalog.sections[
            activeSection
          ].filter(
            (currentItem) =>
              currentItem.id !== item.id
          )
      }
    };

    await persistCatalog(
      nextCatalog,
      "Value deleted",
      `"${item.value}" was removed from ${masterDataLabels[activeSection]}.`
    );
  }

  return (
    <AppShell>
      {loading ? (
        <LoadingOverlay label="Loading Master Data..." />
      ) : null}

      {saving ? (
        <LoadingOverlay label="Saving Master Data..." />
      ) : null}

      <div className="app-page">
        <section className="app-card">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="app-title">
                Master Data
              </h1>

              <p className="app-subtitle">
                Control the values available
                during flight log entry.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:min-w-[330px]">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-center">
                <p className="text-xl font-bold text-slate-950">
                  {totals.all}
                </p>
                <p className="text-[11px] font-semibold uppercase text-slate-500">
                  Total
                </p>
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-center">
                <p className="text-xl font-bold text-emerald-700">
                  {totals.active}
                </p>
                <p className="text-[11px] font-semibold uppercase text-emerald-700">
                  Active
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-3 text-center">
                <p className="text-xl font-bold text-slate-700">
                  {totals.inactive}
                </p>
                <p className="text-[11px] font-semibold uppercase text-slate-600">
                  Inactive
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {sections.map((section) => {
                const Icon = section.icon;
                const selected =
                  section.key ===
                  activeSection;

                const count =
                  catalog?.sections[
                    section.key
                  ].length ?? 0;

                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => {
                      setActiveSection(
                        section.key
                      );
                      setQuery("");
                      setStatusFilter("all");
                    }}
                    className={`flex h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${
                      selected
                        ? "bg-slate-950 text-white"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {section.shortLabel}

                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] ${
                        selected
                          ? "bg-white/15 text-white"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white">
                  <selectedSection.icon className="h-5 w-5" />
                </div>

                <div>
                  <h2 className="text-lg font-bold text-slate-950">
                    {
                      masterDataLabels[
                        activeSection
                      ]
                    }
                  </h2>

                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                    {
                      selectedSection.description
                    }
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={openAddEditor}
                className="app-button-primary w-full justify-center sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                Add value
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-3 lg:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  value={query}
                  onChange={(event) =>
                    setQuery(
                      event.target.value
                    )
                  }
                  className="app-input pl-10"
                  placeholder={`Search ${selectedSection.shortLabel.toLowerCase()}`}
                />
              </div>

              <div className="grid grid-cols-3 rounded-lg bg-slate-100 p-1 lg:w-[310px]">
                {(
                  [
                    "all",
                    "active",
                    "inactive"
                  ] as StatusFilter[]
                ).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() =>
                      setStatusFilter(
                        status
                      )
                    }
                    className={`h-9 rounded-md px-2 text-xs font-semibold capitalize transition ${
                      statusFilter === status
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-500"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="hidden md:block">
            <div className="grid grid-cols-[minmax(0,1fr)_130px_130px] border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase text-slate-500">
              <span>Value</span>
              <span>Status</span>
              <span className="text-right">
                Actions
              </span>
            </div>

            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="grid min-h-[64px] grid-cols-[minmax(0,1fr)_130px_130px] items-center border-b border-slate-100 px-5 last:border-b-0"
              >
                <p className="truncate pr-4 text-sm font-semibold text-slate-900">
                  {item.value}
                </p>

                <StatusLabel
                  status={item.status}
                />

                <div className="flex justify-end gap-1">
                  <IconButton
                    label={`Edit ${item.value}`}
                    onClick={() =>
                      openEditEditor(item)
                    }
                  >
                    <Edit3 className="h-4 w-4" />
                  </IconButton>

                  <IconButton
                    label={`Make ${item.value} ${
                      item.status === "active"
                        ? "inactive"
                        : "active"
                    }`}
                    onClick={() =>
                      toggleStatus(item)
                    }
                  >
                    {item.status ===
                    "active" ? (
                      <CircleOff className="h-4 w-4" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </IconButton>

                  <IconButton
                    label={`Delete ${item.value}`}
                    danger
                    onClick={() =>
                      deleteItem(item)
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>

          <div className="divide-y divide-slate-100 md:hidden">
            {filteredItems.map((item) => (
              <article
                key={item.id}
                className="p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 break-words text-sm font-semibold text-slate-950">
                    {item.value}
                  </p>

                  <StatusLabel
                    status={item.status}
                  />
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <IconButton
                    label={`Edit ${item.value}`}
                    onClick={() =>
                      openEditEditor(item)
                    }
                  >
                    <Edit3 className="h-4 w-4" />
                  </IconButton>

                  <IconButton
                    label={`Change status for ${item.value}`}
                    onClick={() =>
                      toggleStatus(item)
                    }
                  >
                    {item.status ===
                    "active" ? (
                      <CircleOff className="h-4 w-4" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </IconButton>

                  <IconButton
                    label={`Delete ${item.value}`}
                    danger
                    onClick={() =>
                      deleteItem(item)
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </article>
            ))}
          </div>

          {!filteredItems.length ? (
            <div className="px-5 py-14 text-center">
              <Boxes className="mx-auto h-9 w-9 text-slate-300" />

              <h3 className="mt-3 text-sm font-bold text-slate-900">
                No values found
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Try another search or add a
                new value.
              </p>
            </div>
          ) : null}
        </section>
      </div>

      {editor ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() =>
              !saving &&
              setEditor(null)
            }
            aria-label="Close editor"
          />

          <form
            onSubmit={saveEditor}
            className="relative z-10 w-full rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-950">
                  {editor.mode === "add"
                    ? "Add value"
                    : "Edit value"}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {
                    masterDataLabels[
                      editor.section
                    ]
                  }
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setEditor(null)
                }
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mt-6 block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Value
              </span>

              <input
                autoFocus
                value={editor.value}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    value:
                      event.target.value
                  })
                }
                className="app-input"
                placeholder={`Enter ${masterDataLabels[
                  editor.section
                ].toLowerCase()}`}
              />
            </label>

            <div className="mt-5">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Status
              </span>

              <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">
                {(
                  [
                    "active",
                    "inactive"
                  ] as ItemStatus[]
                ).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() =>
                      setEditor({
                        ...editor,
                        status
                      })
                    }
                    className={`h-10 rounded-md text-sm font-semibold capitalize transition ${
                      editor.status === status
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-500"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() =>
                  setEditor(null)
                }
                className="app-button-secondary justify-center"
              >
                Cancel
              </button>

              <button
                type="submit"
                className="app-button-primary justify-center"
              >
                {editor.mode === "add"
                  ? "Add value"
                  : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}

function StatusLabel({
  status
}: {
  status: ItemStatus;
}) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${
        status === "active"
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "active"
            ? "bg-emerald-500"
            : "bg-slate-400"
        }`}
      />

      <span className="capitalize">
        {status}
      </span>
    </span>
  );
}

function IconButton({
  label,
  danger = false,
  onClick,
  children
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${
        danger
          ? "border-red-200 text-red-600 hover:bg-red-50"
          : "border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-950"
      }`}
    >
      {children}
    </button>
  );
}
