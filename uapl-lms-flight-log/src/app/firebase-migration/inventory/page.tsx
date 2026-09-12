"use client";

import { FirebaseError } from "firebase/app";
import {
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import {
  Boxes,
  CheckCircle2,
  DatabaseZap,
  Loader2,
  ShieldCheck,
  TriangleAlert
} from "lucide-react";
import { FormEvent, useState } from "react";
import { sessionKey } from "@/lib/demo-auth";
import { firebaseAuth, firestore } from "@/lib/firebase-client";
import {
  analyzeInventoryMigration,
  loadGoogleInventorySource,
  migrateInventoryToFirestore,
  verifyInventoryMigration,
  type InventoryMigrationAnalysis,
  type InventoryMigrationVerification
} from "@/lib/inventory-firebase-migration";

type ConnectedAdmin = { uid: string; email: string; name: string };

function readableError(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === "auth/invalid-credential") {
      return "The Firebase email or password is incorrect.";
    }
    if (error.code === "permission-denied") {
      return "Firestore denied this operation. Deploy the latest rules first.";
    }
    return `${error.message} (${error.code})`;
  }
  return error instanceof Error ? error.message : "The migration operation failed.";
}

function hasAppsScriptSession() {
  try {
    const raw = localStorage.getItem(sessionKey);
    if (!raw) return false;
    const session = JSON.parse(raw) as { sessionToken?: string; expiresAt?: string };
    return Boolean(
      session.sessionToken &&
        session.expiresAt &&
        new Date(session.expiresAt).getTime() > Date.now()
    );
  } catch {
    return false;
  }
}

export default function InventoryMigrationPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [admin, setAdmin] = useState<ConnectedAdmin | null>(null);
  const [analysis, setAnalysis] = useState<InventoryMigrationAnalysis | null>(null);
  const [verification, setVerification] = useState<InventoryMigrationVerification | null>(null);
  const [runId, setRunId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function connectFirebase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await setPersistence(firebaseAuth, browserSessionPersistence);
      const credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      const profileSnapshot = await getDoc(doc(firestore, "users", credential.user.uid));
      if (!profileSnapshot.exists()) throw new Error("The Firebase user profile does not exist.");
      const profile = profileSnapshot.data();
      if (profile.status !== "active" || profile.role !== "admin") {
        throw new Error("Only an active Firebase administrator can run migration.");
      }
      setAdmin({
        uid: credential.user.uid,
        email: String(credential.user.email || profile.email || ""),
        name: String(profile.name || credential.user.email || "Administrator")
      });
    } catch (connectionError) {
      setAdmin(null);
      setError(readableError(connectionError));
    } finally {
      setBusy(false);
    }
  }

  async function analyzeSource() {
    if (!admin) return;
    if (!hasAppsScriptSession()) {
      setError("Sign in to the normal staging application first, then return here.");
      return;
    }
    setBusy(true);
    setError("");
    setAnalysis(null);
    setVerification(null);
    setRunId("");
    try {
      setAnalysis(analyzeInventoryMigration(await loadGoogleInventorySource()));
    } catch (analysisError) {
      setError(readableError(analysisError));
    } finally {
      setBusy(false);
    }
  }

  async function copySource() {
    if (!admin || !analysis) return;
    setBusy(true);
    setError("");
    setVerification(null);
    try {
      const result = await migrateInventoryToFirestore(analysis, {
        uid: admin.uid,
        email: admin.email
      });
      setRunId(result.runId);
    } catch (migrationError) {
      setError(readableError(migrationError));
    } finally {
      setBusy(false);
    }
  }

  async function verifySource() {
    if (!analysis) return;
    setBusy(true);
    setError("");
    setVerification(null);
    try {
      setVerification(await verifyInventoryMigration(analysis));
    } catch (verificationError) {
      setError(readableError(verificationError));
    } finally {
      setBusy(false);
    }
  }

  const blocked = Boolean(analysis?.invalidItems.length || analysis?.duplicateItems.length);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/30">
          <header className="border-b border-slate-700 px-6 py-6 sm:px-8">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
              <Boxes className="h-5 w-5" />
            </div>
            <p className="text-xs font-bold uppercase text-cyan-300">Administrator migration utility</p>
            <h1 className="mt-2 text-2xl font-bold text-white">Inventory</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Copy Inventory Master Data, assets, movement history, and maintenance records. Existing photos and documents remain in their current Google source.
            </p>
          </header>

          {!admin ? (
            <form className="space-y-5 px-6 py-6 sm:px-8" onSubmit={connectFirebase}>
              <Field label="Firebase admin email" type="email" value={email} onChange={setEmail} />
              <Field label="Firebase password" type="password" value={password} onChange={setPassword} />
              <button className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 font-bold text-slate-950 disabled:opacity-60" disabled={busy} type="submit">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                Connect Firebase administrator
              </button>
            </form>
          ) : (
            <div className="space-y-5 px-6 py-6 sm:px-8">
              <div className="flex gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
                <div>
                  <p className="font-bold text-emerald-100">Firebase admin connected</p>
                  <p className="text-sm text-emerald-200/80">{admin.name} - {admin.email}</p>
                </div>
              </div>

              <button className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 font-bold hover:border-cyan-400 disabled:opacity-60" disabled={busy} onClick={analyzeSource} type="button">
                {busy && !analysis ? <Loader2 className="h-5 w-5 animate-spin" /> : <DatabaseZap className="h-5 w-5" />}
                Analyze Google Sheets Inventory
              </button>

              {analysis ? (
                <div className="rounded-xl border border-slate-700 bg-slate-950 p-5">
                  <h2 className="text-lg font-bold">Migration review</h2>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Stat label="Master Data" value={analysis.masterDataCount} />
                    <Stat label="Equipment types" value={analysis.sectionCounts.equipmentTypes} />
                    <Stat label="Locations" value={analysis.sectionCounts.storageLocations} />
                    <Stat label="Conditions" value={analysis.sectionCounts.conditions} />
                    <Stat label="Assets" value={analysis.assetCount} />
                    <Stat label="Active assets" value={analysis.activeAssetCount} />
                    <Stat label="Transactions" value={analysis.transactionCount} />
                    <Stat label="Maintenance" value={analysis.maintenanceCount} />
                    <Stat label="Photo references" value={analysis.photoCount} />
                    <Stat label="Document references" value={analysis.documentCount} />
                  </div>

                  {analysis.embeddedMediaCount ? (
                    <div className="mt-4 rounded-lg border border-sky-400/30 bg-sky-400/10 p-4 text-sm text-sky-100">
                      {analysis.embeddedMediaCount} embedded media file(s) remain in Google. Firestore receives their metadata only, avoiding oversized database documents and unnecessary Firebase Storage use.
                    </div>
                  ) : null}

                  {blocked ? (
                    <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
                      <p className="font-bold">Source data requires correction</p>
                      {[...analysis.invalidItems, ...analysis.duplicateItems].map((item) => <p className="mt-1 break-words" key={item}>{item}</p>)}
                    </div>
                  ) : null}

                  <button className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 font-bold text-slate-950 disabled:opacity-50" disabled={busy || blocked} onClick={copySource} type="button">
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <DatabaseZap className="h-5 w-5" />}
                    Copy Inventory to Firestore
                  </button>
                  <button className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 font-bold text-cyan-100 disabled:opacity-50" disabled={busy || blocked} onClick={verifySource} type="button">
                    <ShieldCheck className="h-5 w-5" />
                    Verify Firestore Copy
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {error ? <Notice tone="error" text={error} /> : null}
          {runId ? <Notice tone="success" text={`Inventory migration completed. Run ID: ${runId}`} /> : null}
          {verification ? (
            <div className={`m-6 rounded-xl border p-4 text-sm sm:m-8 ${verification.verified ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-amber-400/30 bg-amber-400/10 text-amber-100"}`}>
              <p className="font-bold">{verification.verified ? "Firestore Inventory verified exactly." : "Verification found differences."}</p>
              {Object.keys(verification.expected).map((key) => <p className="mt-2" key={key}>{key}: {verification.actual[key]} / {verification.expected[key]}</p>)}
              {verification.mismatches.map((item) => <p className="mt-1 break-words" key={item}>{item}</p>)}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Field({ label, type, value, onChange }: { label: string; type: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <input className="mt-2 h-12 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 outline-none focus:border-cyan-400" onChange={(event) => onChange(event.target.value)} required type={type} value={value} />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-slate-900 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>;
}

function Notice({ tone, text }: { tone: "error" | "success"; text: string }) {
  const success = tone === "success";
  return (
    <div className={`m-6 flex gap-3 rounded-xl border p-4 text-sm sm:m-8 ${success ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-rose-400/30 bg-rose-400/10 text-rose-100"}`} role={success ? "status" : "alert"}>
      {success ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <TriangleAlert className="h-5 w-5 shrink-0" />}
      <p className="break-words">{text}</p>
    </div>
  );
}
