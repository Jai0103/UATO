"use client";

import { AppShell } from "@/components/app-shell";
import { useAppMessage } from "@/components/message-provider";
import {
  defaultPreferences,
  loadPreferences,
  savePreferences,
  type AppPreferences,
  type AppTheme
} from "@/lib/app-preferences";
import { Check, Gauge, Laptop, Moon, Save, ShieldCheck, Smartphone, Sun } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const themes: Array<{ value: AppTheme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop }
];

export default function SettingsPage() {
  const message = useAppMessage();
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setPreferences(loadPreferences());
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
  }, []);

  function save() {
    savePreferences(preferences);
    message.notify({ type: "success", title: "Settings saved", message: "Your preferences were applied on this device." });
  }

  return (
    <AppShell>
      <div className="app-page max-w-5xl">
        <header className="app-page-header">
          <p className="app-section-label">Personalisation</p>
          <h1 className="app-title mt-1">Settings</h1>
          <p className="app-subtitle mt-2">Adjust how the system looks and behaves on this device.</p>
        </header>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="app-card">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700"><Sun size={19} /></div><div><h2 className="app-section-title">Appearance</h2><p className="mt-1 text-sm text-[#718096]">Choose a comfortable interface theme.</p></div></div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {themes.map((theme) => { const Icon = theme.icon; const active = preferences.theme === theme.value; return <button key={theme.value} type="button" onClick={() => setPreferences((current) => ({ ...current, theme: theme.value }))} className={`relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition ${active ? "border-[#0866ff] bg-blue-50 text-[#075f8f] ring-1 ring-[#0866ff]" : "border-[#d7e0ea] bg-white text-[#52667d] hover:border-[#9ab7ca] hover:bg-[#f7f9fb]"}`}><Icon size={20} />{theme.label}{active ? <Check size={14} className="absolute right-2 top-2" /> : null}</button>; })}
            </div>
          </section>

          <section className="app-card">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Gauge size={19} /></div><div><h2 className="app-section-title">Workspace</h2><p className="mt-1 text-sm text-[#718096]">Control navigation and motion.</p></div></div>
            <div className="mt-5 divide-y divide-[#e5ebf2]">
              <SettingToggle label="Compact navigation" description="Start with the desktop sidebar collapsed." checked={preferences.compactNavigation} onChange={(checked) => setPreferences((current) => ({ ...current, compactNavigation: checked }))} />
              <SettingToggle label="Reduce motion" description="Minimise hover movement and interface animation." checked={preferences.reducedMotion} onChange={(checked) => setPreferences((current) => ({ ...current, reducedMotion: checked }))} />
            </div>
            <label className="mt-5 block"><span className="text-sm font-semibold text-[#405168]">Default start page</span><select className="app-input mt-2" value={preferences.startPage} onChange={(event) => setPreferences((current) => ({ ...current, startPage: event.target.value as AppPreferences["startPage"] }))}><option value="/admin">Dashboard</option><option value="/flight-logs">Flight Logs</option></select></label>
          </section>

          <section className="app-card">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700"><ShieldCheck size={19} /></div><div><h2 className="app-section-title">Account security</h2><p className="mt-1 text-sm text-[#718096]">Firebase Authentication protects your account.</p></div></div>
            <Link href="/change-password" className="app-button-secondary mt-5 justify-center">Change password</Link>
          </section>

          <section className="app-card">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-700"><Smartphone size={19} /></div><div><h2 className="app-section-title">Installed application</h2><p className="mt-1 text-sm text-[#718096]">Use the system from your home screen.</p></div></div>
            <div className="mt-5 rounded-lg border border-[#d7e0ea] bg-[#f7f9fb] p-4 text-sm text-[#52667d]">{installed ? "This device is running the installed application." : "The application is currently running in a browser. Use the install prompt when available."}</div>
          </section>
        </div>

        <div className="flex justify-end"><button type="button" onClick={save} className="app-button-primary min-h-11 justify-center px-6"><Save size={16} /> Save settings</button></div>
      </div>
    </AppShell>
  );
}

function SettingToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex cursor-pointer items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"><span><span className="block text-sm font-semibold text-[#405168]">{label}</span><span className="mt-1 block text-xs leading-5 text-[#718096]">{description}</span></span><input type="checkbox" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="relative h-7 w-12 shrink-0 rounded-full bg-slate-300 transition peer-checked:bg-[#0866ff] peer-focus-visible:ring-2 peer-focus-visible:ring-[#0866ff]/30"><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} /></span></label>;
}
