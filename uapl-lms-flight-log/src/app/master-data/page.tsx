"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import { postToGoogle } from "@/lib/google-api";
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

type CatalogApiResponse = {
  ok?: boolean;
  success?: boolean;
  message?: string;
  catalog?: MasterDataCatalog;
  masterData?: MasterData;
};

async function postCatalog(
  payload: Record<string, unknown>
) {
  return postToGoogle<CatalogApiResponse>(
    payload
  );
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

  const ActiveSectionIcon = selectedSection.icon;

  const currentItems =
    catalog?.sections[activeSection] ??
    [];

  const sectionTotals = useMemo(
    () => ({
      all: currentItems.length,
      active: currentItems.filter((item) => item.status === "active").length,
      inactive: currentItems.filter((item) => item.status === "inactive").length,
    }),
    [currentItems]
  );

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

      <div className="app-page mx-auto w-full max-w-[1600px]">
        <section className="app-page-header">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="app-title">
                Master Data
              </h1>

              <p className="app-subtitle">Control active reference values available during flight log entry.</p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:min-w-[330px]">
              <div className="rounded-lg border border-[#d7e0ea] bg-[#f7f9fb] px-3 py-3 text-center">
                <p className="text-xl font-bold text-[#16263c]">
                  {totals.all}
                </p>
                <p className="text-[11px] font-semibold uppercase text-[#718096]">
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

              <div className="rounded-lg border border-[#d7e0ea] bg-[#eef2f6] px-3 py-3 text-center">
                <p className="text-xl font-bold text-[#506278]">
                  {totals.inactive}
                </p>
                <p className="text-[11px] font-semibold uppercase text-[#607389]">
                  Inactive
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="app-table-shell">
          <div className="border-b border-[#dbe3ec] bg-[#f7f9fb] p-3 sm:p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
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
                    className={`flex h-12 min-w-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold shadow-sm transition ${
                      selected
                        ? "border-[#102a43] bg-[#102a43] text-white shadow-[0_5px_14px_rgba(16,42,67,0.16)]"
                        : "border-[#d7e0ea] bg-white text-[#506278] hover:border-[#9ec3d7] hover:bg-[#edf5f8] hover:text-[#075f8f]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {section.shortLabel}

                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] ${
                        selected
                          ? "bg-white/15 text-white"
                          : "bg-[#e8eef4] text-[#607389]"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-b border-[#dbe3ec] p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#102a43] text-[#70c8e8] shadow-sm">
                  <ActiveSectionIcon className="h-5 w-5" />
                </div>

                <div>
                  <h2 className="text-lg font-bold text-[#16263c]">
                    {
                      masterDataLabels[
                        activeSection
                      ]
                    }
                  </h2>

                  <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6b7d92]">
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
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7e8fa3]" />

                <input
                  value={query}
                  onChange={(event) =>
                    setQuery(
                      event.target.value
                    )
                  }
                  className="app-input mt-0 pl-10 pr-11"
                  placeholder={`Search ${selectedSection.shortLabel.toLowerCase()}`}
                />
                {query ? (
                  <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#8493a5] hover:bg-[#edf3f7] hover:text-[#075f8f]" aria-label="Clear search"><X className="h-4 w-4" /></button>
                ) : null}
              </div>

              <div className="grid grid-cols-3 rounded-lg bg-[#e8eef4] p-1 lg:w-[310px]">
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
                        ? "bg-white text-[#16263c] shadow-sm"
                        : "text-[#607389]"
                    }`}
                  >
                    {status} ({sectionTotals[status]})
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="hidden md:block">
            <div className="app-table-header grid grid-cols-[minmax(0,1fr)_130px_130px] px-5 py-3">
              <span>Value</span>
              <span>Status</span>
              <span className="text-right">
                Actions
              </span>
            </div>

            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="grid min-h-[64px] grid-cols-[minmax(0,1fr)_130px_130px] items-center border-b border-[#e7edf3] px-5 transition last:border-b-0 hover:bg-[#f7fafc]"
              >
                <p className="truncate pr-4 text-sm font-semibold text-[#16263c]">
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

          <div className="divide-y divide-[#e4eaf1] md:hidden">
            {filteredItems.map((item) => (
              <article
                key={item.id}
                className={`border-l-[3px] p-4 ${item.status === "inactive" ? "border-l-[#aab7c5] bg-[#f7f9fb]" : "border-l-[#1686b1] bg-white"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 break-words text-sm font-semibold text-[#16263c]">
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
              <Boxes className="mx-auto h-9 w-9 text-[#b7c3d0]" />

              <h3 className="mt-3 text-sm font-bold text-[#16263c]">
                No values found
              </h3>

              <p className="mt-1 text-sm text-[#718096]">
                Try another search or add a
                new value.
              </p>
            </div>
          ) : null}
        </section>
      </div>

      {editor ? (
        <div className="app-overlay-enter fixed inset-0 z-[80] flex items-end justify-center bg-[#102a43]/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
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
            className="app-panel-enter relative z-10 w-full rounded-t-lg border border-[#d7e0ea] bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_24px_64px_rgba(16,42,67,0.3)] sm:max-w-md sm:rounded-lg sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-[#16263c]">
                  {editor.mode === "add"
                    ? "Add value"
                    : "Edit value"}
                </h2>

                <p className="mt-1 text-sm text-[#6b7d92]">
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
                disabled={saving}
                className="app-icon-button"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mt-6 block">
              <span className="mb-2 block text-sm font-semibold text-[#405168]">
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
                className="app-input mt-0"
                placeholder={`Enter ${masterDataLabels[
                  editor.section
                ].toLowerCase()}`}
              />
            </label>

            <div className="mt-5">
              <span className="mb-2 block text-sm font-semibold text-[#405168]">
                Status
              </span>

              <div className="grid grid-cols-2 rounded-lg bg-[#e8eef4] p-1">
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
                        ? "bg-white text-[#16263c] shadow-sm"
                        : "text-[#607389]"
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
                disabled={saving}
                className="app-button-secondary justify-center"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
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
          : "bg-[#eef2f6] text-[#607389] ring-1 ring-[#d7e0ea]"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "active"
            ? "bg-emerald-500"
            : "bg-[#8b9bad]"
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
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white shadow-sm transition ${
        danger
          ? "border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50"
          : "border-[#d7e0ea] text-[#607389] hover:border-[#9ec3d7] hover:bg-[#f1f8fb] hover:text-[#075f8f]"
      }`}
    >
      {children}
    </button>
  );
}
