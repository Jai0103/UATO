"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import { fetchGoogleMasterData, saveGoogleMasterData } from "@/lib/google-api";
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
  GraduationCap,
  MapPin,
  Plane,
  Plus,
  Tag,
  Trash2
} from "lucide-react";
import { useEffect, useState } from "react";

const masterDataSections: {
  key: MasterDataKey;
  description: string;
  icon: typeof MapPin;
}[] = [
  {
    key: "locations",
    description: "Training and flight locations available in the flight form.",
    icon: MapPin
  },
  {
    key: "batterySerialNumbers",
    description: "Battery serial numbers shown as searchable suggestions.",
    icon: BatteryCharging
  },
  {
    key: "afeInstructors",
    description: "Instructor reference list for administrative tracking.",
    icon: GraduationCap
  },
  {
    key: "uaModels",
    description: "UA model and serial number suggestions for flight entries.",
    icon: Plane
  },
  {
    key: "uaCategories",
    description: "UA category dropdown values used during flight entry.",
    icon: Tag
  }
];

export default function MasterDataPage() {
  const { notify, confirm } = useAppMessage();

  const [masterData, setMasterData] = useState<MasterData | null>(null);
  const [inputs, setInputs] = useState<Record<MasterDataKey, string>>({
    locations: "",
    batterySerialNumbers: "",
    afeInstructors: "",
    uaModels: "",
    uaCategories: ""
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMasterData() {
      setLoading(true);

      try {
        const googleMasterData = await fetchGoogleMasterData();
        setMasterData(googleMasterData);
        saveMasterData(googleMasterData);
      } catch {
        setMasterData(getMasterData());
        notify({
          type: "warning",
          title: "Using local master data",
          message: "Google Sheets master data could not be loaded."
        });
      } finally {
        setLoading(false);
      }
    }

    loadMasterData();
  }, [notify]);

  function addItem(section: MasterDataKey) {
    if (!masterData) return;

    const value = inputs[section].trim();

    if (!value) {
      notify({
        type: "warning",
        title: "Value required",
        message: `Enter a value before adding to ${masterDataLabels[section]}.`
      });
      return;
    }

    const exists = masterData[section].some(
      (item) => item.toLowerCase() === value.toLowerCase()
    );

    if (exists) {
      notify({
        type: "warning",
        title: "Duplicate value",
        message: `${value} already exists in ${masterDataLabels[section]}.`
      });
      return;
    }

    const updatedData: MasterData = {
      ...masterData,
      [section]: [...masterData[section], value].sort((a, b) =>
        a.localeCompare(b)
      )
    };

    setMasterData(updatedData);
    saveMasterData(updatedData);
    setInputs((current) => ({ ...current, [section]: "" }));

    saveGoogleMasterData(updatedData)
      .then(() => {
        notify({
          type: "success",
          title: "Master data updated",
          message: `${value} was added to ${masterDataLabels[section]}.`
        });
      })
      .catch(() => {
        notify({
          type: "error",
          title: "Google Sheets sync failed",
          message: `${value} was saved locally, but not synced to Google Sheets.`
        });
      });
  }

  async function deleteItem(section: MasterDataKey, value: string) {
    if (!masterData) return;

    const confirmed = await confirm({
      title: "Delete master data item?",
      message: `Remove "${value}" from ${masterDataLabels[section]}?`,
      confirmLabel: "Delete",
      variant: "danger"
    });

    if (!confirmed) return;

    const updatedData: MasterData = {
      ...masterData,
      [section]: masterData[section].filter((item) => item !== value)
    };

    setMasterData(updatedData);
    saveMasterData(updatedData);

    saveGoogleMasterData(updatedData)
      .then(() => {
        notify({
          type: "success",
          title: "Master data deleted",
          message: `${value} was removed from ${masterDataLabels[section]}.`
        });
      })
      .catch(() => {
        notify({
          type: "error",
          title: "Google Sheets sync failed",
          message: `${value} was removed locally, but not synced to Google Sheets.`
        });
      });
  }

  const totalValues = masterData
    ? Object.values(masterData).reduce((total, values) => total + values.length, 0)
    : 0;

  return (
    <AppShell>
      {loading ? <LoadingOverlay label="Loading master data..." /> : null}

      <div className="app-page">
        <section className="app-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="app-title">Master Data</h1>
              <p className="app-subtitle">
                Manage dropdown and search values used by flight log records.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2 text-center sm:w-72">
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-lg font-semibold text-slate-950">
                  {masterDataSections.length}
                </p>
                <p className="text-[11px] font-medium uppercase text-slate-500">
                  Sections
                </p>
              </div>

              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-lg font-semibold text-slate-950">
                  {totalValues}
                </p>
                <p className="text-[11px] font-medium uppercase text-slate-500">
                  Values
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          {masterData &&
            masterDataSections.map((section) => {
              const Icon = section.icon;
              const items = masterData[section.key];

              return (
                <article key={section.key} className="app-card">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-navy text-white">
                      <Icon size={18} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-semibold text-slate-950">
                            {masterDataLabels[section.key]}
                          </h2>
                          <p className="mt-1 text-sm leading-6 text-slate-500">
                            {section.description}
                          </p>
                        </div>

                        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                          {items.length}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={inputs[section.key]}
                      onChange={(event) =>
                        setInputs((current) => ({
                          ...current,
                          [section.key]: event.target.value
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addItem(section.key);
                        }
                      }}
                      className="h-12 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-base outline-none focus:border-brand-blue md:h-11 md:text-sm"
                      placeholder={`Add ${masterDataLabels[section.key]}`}
                    />

                    <button
                      onClick={() => addItem(section.key)}
                      className="app-button-primary sm:w-auto"
                      aria-label={`Add ${masterDataLabels[section.key]}`}
                    >
                      <Plus size={16} />
                      Add
                    </button>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {items.length ? (
                      items.map((item) => (
                        <span
                          key={item}
                          className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                        >
                          <span className="truncate">{item}</span>
                          <button
                            onClick={() => deleteItem(section.key, item)}
                            className="shrink-0 text-slate-400 hover:text-red-600"
                            aria-label={`Delete ${item}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </span>
                      ))
                    ) : (
                      <div className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                        <Boxes size={24} className="mx-auto text-slate-400" />
                        <p className="mt-2 text-sm text-slate-500">
                          No values added yet.
                        </p>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
        </section>
      </div>
    </AppShell>
  );
}
