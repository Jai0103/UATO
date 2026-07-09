"use client";

import { AppShell } from "@/components/app-shell";
import {
  getMasterData,
  masterDataLabels,
  saveMasterData,
  type MasterData,
  type MasterDataKey
} from "@/lib/master-data";
import { ClipboardCheck, Clock, GraduationCap, Plus, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";

const stats = [
  { label: "Students", value: "24", icon: GraduationCap },
  { label: "Pending Uploads", value: "7", icon: Clock },
  { label: "Trainers", value: "5", icon: Users },
  { label: "Completed Logs", value: "38", icon: ClipboardCheck }
];

const masterDataSections: MasterDataKey[] = [
  "locations",
  "batterySerialNumbers",
  "afeInstructors",
  "uaModels",
  "uaCategories"
];

export default function AdminPage() {
  const [masterData, setMasterData] = useState<MasterData | null>(null);
  const [inputs, setInputs] = useState<Record<MasterDataKey, string>>({
    locations: "",
    batterySerialNumbers: "",
    afeInstructors: "",
    uaModels: "",
    uaCategories: ""
  });
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    setMasterData(getMasterData());
  }, []);

  function addItem(section: MasterDataKey) {
    if (!masterData) return;

    const value = inputs[section].trim();

    if (!value) return;

    const exists = masterData[section].some(
      (item) => item.toLowerCase() === value.toLowerCase()
    );

    if (exists) {
      setStatusMessage(`${value} already exists in ${masterDataLabels[section]}.`);
      return;
    }

    const updatedData = {
      ...masterData,
      [section]: [...masterData[section], value].sort((a, b) =>
        a.localeCompare(b)
      )
    };

    setMasterData(updatedData);
    saveMasterData(updatedData);
    setInputs((current) => ({ ...current, [section]: "" }));
    setStatusMessage(`${value} added to ${masterDataLabels[section]}.`);
  }

  function deleteItem(section: MasterDataKey, value: string) {
    if (!masterData) return;

    const updatedData = {
      ...masterData,
      [section]: masterData[section].filter((item) => item !== value)
    };

    setMasterData(updatedData);
    saveMasterData(updatedData);
    setStatusMessage(`${value} removed from ${masterDataLabels[section]}.`);
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor records and manage flight log reference data.
          </p>
        </div>

        {statusMessage ? (
          <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm">
            {statusMessage}
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;

            return (
              <article
                key={stat.label}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                  <Icon size={20} className="text-brand-gold" />
                </div>
                <p className="mt-4 text-3xl font-semibold text-slate-950">
                  {stat.value}
                </p>
              </article>
            );
          })}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Master Data</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage dropdown and search values used in flight log entries.
          </p>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {masterData &&
              masterDataSections.map((section) => (
                <div key={section} className="rounded-lg border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-950">
                    {masterDataLabels[section]}
                  </h3>

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
                </div>
              ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">User Management</h2>
          <p className="mt-1 text-sm text-slate-500">
            User creation and email invitations will be connected in a later step.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
