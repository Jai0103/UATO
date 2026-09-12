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
  analyzeFlightLogMigration,
  loadAllGoogleFlightLogs,
  migrateFlightLogsToFirestore,
  verifyFlightLogMigration,
  type MigrationAnalysis,
  type MigrationProgress,
  type MigrationVerification
} from "@/lib/flight-log-firebase-migration";

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
      return "Firestore denied this operation. Deploy the latest firestore.rules file first.";
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

export default function FirebaseMigrationPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [admin, setAdmin] = useState<ConnectedAdmin | null>(null);
  const [analysis, setAnalysis] = useState<MigrationAnalysis | null>(null);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [completedRunId, setCompletedRunId] = useState("");
  const [verification, setVerification] =
    useState<MigrationVerification | null>(null);

  async function connectFirebase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCompletedRunId("");
    setVerification(null);

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

  async function analyzeRecords() {
    if (!admin) return;
    if (!hasAppsScriptSession()) {
      setError(
        "Sign in to the normal staging application first, then return to this migration page."
      );
      return;
    }

    setBusy(true);
    setError("");
    setAnalysis(null);
    setCompletedRunId("");
    setVerification(null);

    try {
      const records = await loadAllGoogleFlightLogs(setProgress);
      setAnalysis(analyzeFlightLogMigration(records));
    } catch (analysisError) {
      setError(readableError(analysisError));
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  async function migrateRecords() {
    if (!admin || !analysis) return;
    setBusy(true);
    setError("");
    setCompletedRunId("");
    setVerification(null);

    try {
      const result = await migrateFlightLogsToFirestore(
        analysis,
        { uid: admin.uid, email: admin.email },
        setProgress
      );
      setCompletedRunId(result.runId);
    } catch (migrationError) {
      setError(readableError(migrationError));
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  async function verifyRecords() {
    if (!admin || !analysis) return;
    setBusy(true);
    setError("");
    setVerification(null);

    try {
      setVerification(await verifyFlightLogMigration(analysis));
    } catch (verificationError) {
      setError(readableError(verificationError));
    } finally {
      setBusy(false);
    }
  }

  const migrationBlocked = Boolean(
    analysis?.duplicateIdentifiers.length ||
      analysis?.oversizedSignatures.length
  );

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <section className="rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/30">
          <header className="border-b border-slate-700 px-6 py-6 sm:px-8">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
              <DatabaseZap aria-hidden="true" className="h-5 w-5" />
            </div>
            <p className="text-xs font-bold uppercase text-cyan-300">
              Administrator migration utility
            </p>
            <h1 className="mt-2 text-2xl font-bold text-white">
              Flight Logs to Firestore
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Google Sheets remains unchanged. This utility analyzes the source first and then creates an idempotent Firebase copy.
            </p>
          </header>

          {!admin ? (
            <form className="space-y-5 px-6 py-6 sm:px-8" onSubmit={connectFirebase}>
              <label className="block">
                <span className="text-sm font-semibold text-slate-200">Firebase admin email</span>
                <input
                  autoComplete="username"
                  className="mt-2 h-12 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 text-base text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-200">Firebase password</span>
                <input
                  autoComplete="current-password"
                  className="mt-2 h-12 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 text-base text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
              <button
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
                disabled={busy}
                type="submit"
              >
                {busy ? (
                  <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
                ) : (
                  <ShieldCheck aria-hidden="true" className="h-5 w-5" />
                )}
                Connect Firebase administrator
              </button>
            </form>
          ) : (
            <div className="space-y-5 px-6 py-6 sm:px-8">
              <div className="flex items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
                <div>
                  <p className="font-bold text-emerald-100">Firebase admin connected</p>
                  <p className="text-sm text-emerald-200/80">{admin.name} - {admin.email}</p>
                </div>
              </div>

              <button
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 text-sm font-bold text-white transition hover:border-cyan-400 disabled:opacity-60"
                disabled={busy}
                onClick={analyzeRecords}
                type="button"
              >
                {busy && !analysis ? (
                  <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
                ) : (
                  <DatabaseZap aria-hidden="true" className="h-5 w-5" />
                )}
                Analyze Google Sheets Flight Logs
              </button>

              {analysis ? (
                <section className="rounded-xl border border-slate-700 bg-slate-950 p-5">
                  <h2 className="text-lg font-bold text-white">Migration review</h2>
                  <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-slate-900 p-3">
                      <dt className="text-xs text-slate-400">Students</dt>
                      <dd className="mt-1 text-xl font-bold">{analysis.recordCount}</dd>
                    </div>
                    <div className="rounded-lg bg-slate-900 p-3">
                      <dt className="text-xs text-slate-400">Flights</dt>
                      <dd className="mt-1 text-xl font-bold">{analysis.flightCount}</dd>
                    </div>
                    <div className="rounded-lg bg-slate-900 p-3">
                      <dt className="text-xs text-slate-400">Signatures</dt>
                      <dd className="mt-1 text-xl font-bold">{analysis.signatureCount}</dd>
                    </div>
                  </dl>

                  {analysis.duplicateIdentifiers.length ? (
                    <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
                      <p className="font-bold">Duplicate last-four identifiers</p>
                      {analysis.duplicateIdentifiers.map((item) => (
                        <p className="mt-1 break-words" key={item}>{item}</p>
                      ))}
                    </div>
                  ) : null}

                  {analysis.oversizedSignatures.length ? (
                    <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
                      <p className="font-bold">Oversized signatures</p>
                      <p className="mt-1">{analysis.oversizedSignatures.join(", ")}</p>
                    </div>
                  ) : null}

                  <button
                    className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={busy || migrationBlocked}
                    onClick={migrateRecords}
                    type="button"
                  >
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <DatabaseZap className="h-5 w-5" />}
                    Copy Flight Logs to Firestore
                  </button>

                  <button
                    className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 text-sm font-bold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={busy || migrationBlocked}
                    onClick={verifyRecords}
                    type="button"
                  >
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                    Verify Firestore Copy
                  </button>
                </section>
              ) : null}
            </div>
          )}

          {progress ? (
            <div className="border-t border-slate-700 px-6 py-5 sm:px-8">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="min-w-0 truncate text-slate-300">{progress.label}</span>
                <span className="shrink-0 font-bold text-cyan-300">{progress.current}/{progress.total}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-cyan-400 transition-all"
                  style={{
                    width: `${progress.total ? Math.round((progress.current / progress.total) * 100) : 0}%`
                  }}
                />
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="m-6 flex gap-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100 sm:m-8" role="alert">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
              <p>{error}</p>
            </div>
          ) : null}

          {completedRunId ? (
            <div className="m-6 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100 sm:m-8">
              <p className="font-bold">Flight Log migration completed successfully.</p>
              <p className="mt-1 break-all text-emerald-200/80">Run ID: {completedRunId}</p>
            </div>
          ) : null}

          {verification ? (
            <div
              className={`m-6 rounded-xl border p-4 text-sm sm:m-8 ${
                verification.verified
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                  : "border-amber-400/30 bg-amber-400/10 text-amber-100"
              }`}
            >
              <p className="font-bold">
                {verification.verified
                  ? "Firestore copy verified exactly."
                  : "Firestore verification found differences."}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["records", "flights", "signatures", "identifiers"] as const).map(
                  (key) => (
                    <div className="rounded-lg bg-slate-950/40 p-3" key={key}>
                      <p className="text-xs capitalize opacity-75">{key}</p>
                      <p className="mt-1 font-bold">
                        {verification.actual[key]} / {verification.expected[key]}
                      </p>
                    </div>
                  )
                )}
              </div>
              {verification.mismatches.length ? (
                <div className="mt-4 space-y-1">
                  {verification.mismatches.slice(0, 20).map((mismatch) => (
                    <p className="break-words" key={mismatch}>{mismatch}</p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
