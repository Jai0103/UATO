"use client";

import { FirebaseError } from "firebase/app";
import {
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import {
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
  analyzeMasterDataMigration,
  loadGoogleMasterDataCatalog,
  migrateMasterDataToFirestore,
  verifyMasterDataMigration,
  type MasterDataMigrationAnalysis,
  type MasterDataVerification
} from "@/lib/master-data-firebase-migration";

type ConnectedAdmin = {
  uid: string;
  email: string;
  name: string;
};

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
    const rawSession = localStorage.getItem(sessionKey);
    if (!rawSession) return false;
    const session = JSON.parse(rawSession) as {
      sessionToken?: string;
      expiresAt?: string;
    };
    return Boolean(
      session.sessionToken &&
        session.expiresAt &&
        new Date(session.expiresAt).getTime() > Date.now()
    );
  } catch {
    return false;
  }
}

export default function MasterDataMigrationPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [admin, setAdmin] = useState<ConnectedAdmin | null>(null);
  const [analysis, setAnalysis] =
    useState<MasterDataMigrationAnalysis | null>(null);
  const [verification, setVerification] =
    useState<MasterDataVerification | null>(null);
  const [runId, setRunId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function connectFirebase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      await setPersistence(firebaseAuth, browserSessionPersistence);
      const credential = await signInWithEmailAndPassword(
        firebaseAuth,
        email.trim(),
        password
      );
      const profileSnapshot = await getDoc(
        doc(firestore, "users", credential.user.uid)
      );

      if (!profileSnapshot.exists()) {
        throw new Error("The Firebase user profile does not exist.");
      }

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

  async function analyzeCatalog() {
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
      const catalog = await loadGoogleMasterDataCatalog();
      setAnalysis(analyzeMasterDataMigration(catalog));
    } catch (analysisError) {
      setError(readableError(analysisError));
    } finally {
      setBusy(false);
    }
  }

  async function copyCatalog() {
    if (!admin || !analysis) return;
    setBusy(true);
    setError("");
    setVerification(null);

    try {
      const result = await migrateMasterDataToFirestore(analysis, {
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

  async function verifyCatalog() {
    if (!analysis) return;
    setBusy(true);
    setError("");
    setVerification(null);

    try {
      setVerification(await verifyMasterDataMigration(analysis));
    } catch (verificationError) {
      setError(readableError(verificationError));
    } finally {
      setBusy(false);
    }
  }

  const blocked = Boolean(
    analysis?.duplicateValues.length || analysis?.emptyValues.length
  );

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/30">
          <header className="border-b border-slate-700 px-6 py-6 sm:px-8">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-400/10 text-violet-300">
              <DatabaseZap className="h-5 w-5" />
            </div>
            <p className="text-xs font-bold uppercase text-violet-300">
              Administrator migration utility
            </p>
            <h1 className="mt-2 text-2xl font-bold text-white">
              Flight Log Master Data
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Copy locations, batteries, instructors, UA models, and categories with their current status.
            </p>
          </header>

          {!admin ? (
            <form className="space-y-5 px-6 py-6 sm:px-8" onSubmit={connectFirebase}>
              <label className="block">
                <span className="text-sm font-semibold">Firebase admin email</span>
                <input
                  className="mt-2 h-12 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 outline-none focus:border-violet-400"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">Firebase password</span>
                <input
                  className="mt-2 h-12 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 outline-none focus:border-violet-400"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
              <button
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-400 font-bold text-slate-950 disabled:opacity-60"
                disabled={busy}
                type="submit"
              >
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

              <button
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 font-bold hover:border-violet-400 disabled:opacity-60"
                disabled={busy}
                onClick={analyzeCatalog}
                type="button"
              >
                {busy && !analysis ? <Loader2 className="h-5 w-5 animate-spin" /> : <DatabaseZap className="h-5 w-5" />}
                Analyze Google Sheets Master Data
              </button>

              {analysis ? (
                <div className="rounded-xl border border-slate-700 bg-slate-950 p-5">
                  <h2 className="text-lg font-bold">Migration review</h2>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Stat label="Total" value={analysis.totalItems} />
                    <Stat label="Active" value={analysis.activeItems} />
                    <Stat label="Inactive" value={analysis.inactiveItems} />
                    <Stat label="Locations" value={analysis.sectionCounts.locations} />
                    <Stat label="Batteries" value={analysis.sectionCounts.batterySerialNumbers} />
                    <Stat label="Instructors" value={analysis.sectionCounts.afeInstructors} />
                    <Stat label="UA Models" value={analysis.sectionCounts.uaModels} />
                    <Stat label="Categories" value={analysis.sectionCounts.uaCategories} />
                  </div>

                  {blocked ? (
                    <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
                      <p className="font-bold">Master Data requires correction</p>
                      {[...analysis.duplicateValues, ...analysis.emptyValues].map((item) => (
                        <p className="mt-1 break-words" key={item}>{item}</p>
                      ))}
                    </div>
                  ) : null}

                  <button
                    className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 font-bold text-slate-950 disabled:opacity-50"
                    disabled={busy || blocked}
                    onClick={copyCatalog}
                    type="button"
                  >
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <DatabaseZap className="h-5 w-5" />}
                    Copy Master Data to Firestore
                  </button>
                  <button
                    className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-violet-400/40 bg-violet-400/10 font-bold text-violet-100 disabled:opacity-50"
                    disabled={busy || blocked}
                    onClick={verifyCatalog}
                    type="button"
                  >
                    <ShieldCheck className="h-5 w-5" />
                    Verify Firestore Copy
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {error ? (
            <div className="m-6 flex gap-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100 sm:m-8" role="alert">
              <TriangleAlert className="h-5 w-5 shrink-0" />
              <p>{error}</p>
            </div>
          ) : null}

          {runId ? (
            <div className="m-6 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100 sm:m-8">
              <p className="font-bold">Master Data migration completed.</p>
              <p className="mt-1 break-all opacity-80">Run ID: {runId}</p>
            </div>
          ) : null}

          {verification ? (
            <div className={`m-6 rounded-xl border p-4 text-sm sm:m-8 ${verification.verified ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-amber-400/30 bg-amber-400/10 text-amber-100"}`}>
              <p className="font-bold">
                {verification.verified ? "Firestore Master Data verified exactly." : "Verification found differences."}
              </p>
              <p className="mt-2">Items: {verification.actualCount} / {verification.expectedCount}</p>
              {verification.mismatches.map((item) => (
                <p className="mt-1 break-words" key={item}>{item}</p>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-900 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
