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
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

const masterDataSections: MasterDataKey[] = [
  "locations",
  "batterySerialNumbers",
  "afeInstructors",
  "uaModels",
  "uaCategories"
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

  return (
    <AppShell>
      {loading ? <LoadingOverlay label="Loading master data..." /> : null}

      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Master Data</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage dropdown and search values used by flight log records.
          </p>
        </div>

        <section className="grid gap-5 lg:grid-cols-2">
          {masterData &&
            masterDataSections.map((section) => (
              <article
                key={section}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              >
                <h2 className="text-lg font-semibold text-slate-950">
                  {masterDataLabels[section]}
                </h2>

                <div className="mt-4 flex gap-2">
                  <input
                    value={inputs[section]}
                    onChange={(event) =>
                      setInputs((current) => ({
                        ...current,
                        [section]: event.target.value
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addItem(section);
                      }
                    }}
                    className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-blue"
                    placeholder={`Add ${masterDataLabels[section]}`}
                  />

                  <button
                    onClick={() => addItem(section)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-brand-navy text-white hover:bg-slate-800"
                    aria-label={`Add ${masterDataLabels[section]}`}
                  >
                    <Plus size={16} />
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {masterData[section].length ? (
                    masterData[section].map((item) => (
                      <span
                        key={item}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                      >
                        {item}
                        <button
                          onClick={() => deleteItem(section, item)}
                          className="text-slate-400 hover:text-red-600"
                          aria-label={`Delete ${item}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">No values added yet.</p>
                  )}
                </div>
              </article>
            ))}
        </section>
      </div>
    </AppShell>
  );
}
