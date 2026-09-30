"use client";

import { BookOpenCheck, Check, CircleOff, Edit3, MapPin, Plus, Search, Tag, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import {
  deleteTrainingCatalogueItem,
  fetchTrainingCatalogue,
  saveTrainingLocation,
  saveTrainingProgramme,
  type CatalogueStatus,
  type TrainingCatalogue,
  type TrainingLocation,
  type TrainingProgramme
} from "@/lib/training-catalogue-api";

type Tab = "programmes" | "locations";
type Editor = { type: Tab; id: string; name: string; code: string; status: CatalogueStatus };
const emptyCatalogue: TrainingCatalogue = { programmes: [], locations: [] };
const inputClass = "mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-600 focus:ring-4 focus:ring-sky-100";

function isProgramme(item: TrainingProgramme | TrainingLocation): item is TrainingProgramme {
  return "code" in item && typeof item.code === "string";
}

export default function TrainingCataloguePage() {
  const message = useAppMessage();
  const [catalogue, setCatalogue] = useState(emptyCatalogue);
  const [tab, setTab] = useState<Tab>("programmes");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | CatalogueStatus>("all");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCatalogue(await fetchTrainingCatalogue(true)); }
    catch (error) { message.error("Training catalogue could not load", error instanceof Error ? error.message : "Please try again."); }
    finally { setLoading(false); }
  }, [message]);

  useEffect(() => { void load(); }, [load]);

  const items = useMemo(() => {
    const source = tab === "programmes" ? catalogue.programmes : catalogue.locations;
    const clean = query.trim().toLowerCase();
    return source.filter((item) => status === "all" || item.status === status).filter((item) => !clean || `${item.name} ${isProgramme(item) ? item.code : ""}`.toLowerCase().includes(clean));
  }, [catalogue, query, status, tab]);

  const activeCount = catalogue.programmes.filter((item) => item.status === "active").length + catalogue.locations.filter((item) => item.status === "active").length;

  function openNew() { setEditor({ type: tab, id: "", name: "", code: "", status: "active" }); }
  function openEdit(item: TrainingProgramme | TrainingLocation) { setEditor({ type: tab, id: item.id, name: item.name, code: isProgramme(item) ? item.code : "", status: item.status }); }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || saving) return;
    setSaving(true);
    try {
      if (editor.type === "programmes") await saveTrainingProgramme({ id: editor.id, name: editor.name, code: editor.code, status: editor.status });
      else await saveTrainingLocation({ id: editor.id, name: editor.name, status: editor.status });
      setEditor(null);
      await load();
      message.success(editor.id ? "Master data updated" : "Master data created", "The new options are now available in Evaluation and Attendance.");
    } catch (error) { message.error("Master data could not be saved", error instanceof Error ? error.message : "Please try again."); }
    finally { setSaving(false); }
  }

  async function toggle(item: TrainingProgramme | TrainingLocation) {
    const next = item.status === "active" ? "inactive" : "active";
    try {
      if (tab === "programmes") await saveTrainingProgramme({ ...(item as TrainingProgramme), status: next });
      else await saveTrainingLocation({ ...(item as TrainingLocation), status: next });
      await load();
      message.success(next === "active" ? "Option activated" : "Option archived");
    } catch (error) { message.error("Status could not be changed", error instanceof Error ? error.message : "Please try again."); }
  }

  async function remove(item: TrainingProgramme | TrainingLocation) {
    const approved = await message.confirm({ title: `Delete ${tab === "programmes" ? "programme" : "location"}?`, message: `Delete “${item.name}”? Used items cannot be deleted and should be archived instead.`, confirmLabel: "Delete", cancelLabel: "Cancel", variant: "danger" });
    if (!approved) return;
    try { await deleteTrainingCatalogueItem(tab === "programmes" ? "programme" : "location", item); await load(); message.success("Master data deleted"); }
    catch (error) { message.error("Item could not be deleted", error instanceof Error ? error.message : "Please try again."); }
  }

  return <AppShell>
    {loading ? <LoadingOverlay label="Loading training catalogue" description="Preparing programme and location master data..." /> : null}
    <div className="app-page space-y-4">
      <section className="app-page-header">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase text-sky-700">Shared master data</p><h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Training Catalogue</h1><p className="mt-2 text-sm text-slate-500">One controlled source for course programmes, codes, and training locations.</p></div><button type="button" onClick={openNew} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-sky-800"><Plus size={17} /> Add {tab === "programmes" ? "programme" : "location"}</button></div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3"><Metric label="Programmes" value={catalogue.programmes.length} icon={BookOpenCheck} tone="bg-sky-50 text-sky-700" /><Metric label="Locations" value={catalogue.locations.length} icon={MapPin} tone="bg-violet-50 text-violet-700" /><Metric label="Active options" value={activeCount} icon={Check} tone="bg-emerald-50 text-emerald-700" /></section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">{(["programmes", "locations"] as Tab[]).map((item) => <button key={item} type="button" onClick={() => { setTab(item); setQuery(""); }} className={`h-9 rounded-md px-4 text-sm font-bold capitalize transition ${tab === item ? "bg-sky-700 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>{item}</button>)}</div>
          <div className="flex flex-col gap-2 sm:flex-row"><label className="relative"><Search className="absolute left-3 top-3 text-slate-400" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${tab}`} className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-sky-600 sm:w-64" /></label><select value={status} onChange={(event) => setStatus(event.target.value as "all" | CatalogueStatus)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
        </div>
        <div className="divide-y divide-slate-100">{items.map((item) => <article key={item.id} className="flex flex-col gap-3 px-5 py-4 transition hover:bg-slate-50/80 sm:flex-row sm:items-center"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tab === "programmes" ? "bg-sky-50 text-sky-700" : "bg-violet-50 text-violet-700"}`}>{tab === "programmes" ? <Tag size={18} /> : <MapPin size={18} />}</div><div className="min-w-0 flex-1"><p className="truncate font-bold text-slate-950">{item.name}</p>{isProgramme(item) ? <p className="mt-0.5 text-sm font-semibold text-sky-700">{item.code}</p> : <p className="mt-0.5 text-xs text-slate-500">Training location</p>}</div><span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold capitalize ${item.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{item.status}</span><div className="flex gap-2"><button type="button" onClick={() => void toggle(item)} title={item.status === "active" ? "Archive" : "Activate"} className="app-icon-button flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200">{item.status === "active" ? <CircleOff size={16} /> : <Check size={16} />}</button><button type="button" onClick={() => openEdit(item)} title="Edit" className="app-icon-button flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200"><Edit3 size={16} /></button><button type="button" onClick={() => void remove(item)} title="Delete" className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition hover:bg-rose-50"><Trash2 size={16} /></button></div></article>)}{!items.length ? <div className="p-12 text-center"><BookOpenCheck className="mx-auto text-slate-300" size={34} /><p className="mt-3 font-bold text-slate-700">No {tab} found</p><p className="mt-1 text-sm text-slate-500">Add the first option or adjust your filters.</p></div> : null}</div>
      </section>
    </div>

    {editor ? <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/55 backdrop-blur-sm sm:items-center sm:p-5"><button type="button" aria-label="Close" className="absolute inset-0" onClick={() => setEditor(null)} /><section className="relative w-full rounded-t-xl bg-white shadow-2xl sm:max-w-lg sm:rounded-xl"><header className="flex items-start justify-between border-b border-slate-200 p-5"><div><p className="text-xs font-bold uppercase text-sky-700">Training catalogue</p><h2 className="mt-1 text-xl font-bold text-slate-950">{editor.id ? "Edit" : "Add"} {editor.type === "programmes" ? "programme" : "location"}</h2></div><button type="button" onClick={() => setEditor(null)} className="app-icon-button flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200"><X size={17} /></button></header><form onSubmit={save} className="space-y-4 p-5"><label className="block text-sm font-semibold text-slate-700">{editor.type === "programmes" ? "Programme name" : "Location name"} *<input autoFocus className={inputClass} value={editor.name} maxLength={160} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>{editor.type === "programmes" ? <label className="block text-sm font-semibold text-slate-700">Course code *<input className={`${inputClass} uppercase`} value={editor.code} maxLength={40} onChange={(event) => setEditor({ ...editor, code: event.target.value.toUpperCase() })} placeholder="e.g. UAPL-TM" /></label> : null}<label className="block text-sm font-semibold text-slate-700">Status<select className={inputClass} value={editor.status} onChange={(event) => setEditor({ ...editor, status: event.target.value as CatalogueStatus })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditor(null)} className="h-11 rounded-lg border border-slate-300 px-5 text-sm font-bold text-slate-700">Cancel</button><button disabled={saving} className="h-11 rounded-lg bg-sky-700 px-5 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save master data"}</button></div></form></section></div> : null}
  </AppShell>;
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof MapPin; tone: string }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}><Icon size={18} /></div><p className="mt-3 text-2xl font-bold text-slate-950">{value}</p><p className="text-xs font-bold uppercase text-slate-500">{label}</p></div>;
}
