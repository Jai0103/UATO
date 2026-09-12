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
  History,
  Loader2,
  ShieldCheck,
  TriangleAlert
} from "lucide-react";
import { FormEvent, useState } from "react";
import {
  analyzeAuditHistoryMigration,
  loadGoogleAuditHistorySource,
  migrateAuditHistoryToFirestore,
  verifyAuditHistoryMigration,
  type AuditHistoryMigrationAnalysis,
  type AuditHistoryMigrationVerification,
  type AuditMigrationProgress
} from "@/lib/audit-history-firebase-migration";
import { sessionKey } from "@/lib/demo-auth";
import { firebaseAuth, firestore } from "@/lib/firebase-client";

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
    return error.message + " (" + error.code + ")";
  }
  return error instanceof Error
    ? error.message
    : "The migration operation failed.";
}

function hasAppsScriptSession() {
  try {
    const raw = localStorage.getItem(sessionKey);
    if (!raw) return false;
    const session = JSON.parse(raw) as {
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

export default function AuditHistoryMigrationPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [admin, setAdmin] = useState<ConnectedAdmin | null>(null);
  const [analysis, setAnalysis] =
    useState<AuditHistoryMigrationAnalysis | null>(null);
  const [verification, setVerification] =
    useState<AuditHistoryMigrationVerification | null>(null);
  const [progress, setProgress] = useState<AuditMigrationProgress | null>(null);
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
        throw new Error(
          "Only an active Firebase administrator can run migration."
        );
      }
      setAdmin({
        uid: credential.user.uid,
        email: String(credential.user.email || profile.email || ""),
        name: String(
          profile.name || credential.user.email || "Administrator"
        )
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
      setError(
        "Sign in to the normal staging application first, then return here."
      );
      return;
    }
    setBusy(true);
    setError("");
    setAnalysis(null);
    setVerification(null);
    setRunId("");
    setProgress({ current: 0, total: 0, label: "Loading audit index" });
    try {
      const records = await loadGoogleAuditHistorySource(setProgress);
      setAnalysis(analyzeAuditHistoryMigration(records));
    } catch (analysisError) {
      setError(readableError(analysisError));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function copySource() {
    if (!admin || !analysis) return;
    setBusy(true);
    setError("");
    setVerification(null);
    try {
      const result = await migrateAuditHistoryToFirestore(analysis, {
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
      setVerification(await verifyAuditHistoryMigration(analysis));
    } catch (verificationError) {
      setError(readableError(verificationError));
    } finally {
      setBusy(false);
    }
  }

  const blocked = Boolean(
    analysis?.invalidItems.length ||
      analysis?.duplicateItems.length ||
      analysis?.oversizedDetails.length
  );

  const stats = analysis
    ? [
        ["Audit events", analysis.eventCount],
        ["Detail records", analysis.detailCount],
        ["Actors", analysis.actorCount],
        ["Action types", analysis.actionCount],
        ["Entity types", analysis.entityTypeCount]
      ]
    : [];

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/30">
          <header className="border-b border-slate-700 px-6 py-6 sm:px-8">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-400/10 text-violet-300">
              <History className="h-5 w-5" />
            </div>
            <p className="text-xs font-bold uppercase text-violet-300">
              Administrator migration utility
            </p>
            <h1 className="mt-2 text-2xl font-bold text-white">
              Audit History
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Copy event summaries and full before-and-after details into
              separate Firestore collections without changing Google Sheets.
            </p>
          </header>

          {!admin ? (
            <form
              className="space-y-5 px-6 py-6 sm:px-8"
              onSubmit={connectFirebase}
            >
              <Input
                label="Firebase admin email"
                type="email"
                value={email}
                onChange={setEmail}
              />
              <Input
                label="Firebase password"
                type="password"
                value={password}
                onChange={setPassword}
              />
              <button
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-400 font-bold text-slate-950 disabled:opacity-60"
                disabled={busy}
                type="submit"
              >
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-5 w-5" />
                )}
                Connect Firebase administrator
              </button>
            </form>
          ) : (
            <div className="space-y-5 px-6 py-6 sm:px-8">
              <div className="flex gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
                <div>
                  <p className="font-bold text-emerald-100">
                    Firebase admin connected
                  </p>
                  <p className="text-sm text-emerald-200/80">
                    {admin.name} - {admin.email}
                  </p>
                </div>
              </div>

              <button
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 font-bold hover:border-violet-400 disabled:opacity-60"
                disabled={busy}
                onClick={analyzeSource}
                type="button"
              >
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <DatabaseZap className="h-5 w-5" />
                )}
                Analyze Google Sheets Audit History
              </button>

              {progress ? (
                <div className="rounded-xl border border-violet-400/30 bg-violet-400/10 p-4">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-violet-100">
                      {progress.label}
                    </span>
                    {progress.total ? (
                      <span className="text-violet-200">
                        {progress.current}/{progress.total}
                      </span>
                    ) : null}
                  </div>
                  {progress.total ? (
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-violet-400 transition-[width]"
                        style={{
                          width:
                            Math.round(
                              (progress.current / progress.total) * 100
                            ) + "%"
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {analysis ? (
                <div className="rounded-xl border border-slate-700 bg-slate-950 p-5">
                  <h2 className="text-lg font-bold">Migration review</h2>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {stats.map(([label, value]) => (
                      <Stat
                        key={String(label)}
                        label={String(label)}
                        value={Number(value)}
                      />
                    ))}
                  </div>

                  {blocked ? (
                    <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
                      <p className="font-bold">
                        Source data requires correction
                      </p>
                      {[
                        ...analysis.invalidItems,
                        ...analysis.duplicateItems,
                        ...analysis.oversizedDetails.map(
                          (item) => "Oversized detail: " + item
                        )
                      ].map((item) => (
                        <p className="mt-1 break-words" key={item}>
                          {item}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  <button
                    className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-400 font-bold text-slate-950 disabled:opacity-50"
                    disabled={busy || blocked}
                    onClick={copySource}
                    type="button"
                  >
                    {busy ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <DatabaseZap className="h-5 w-5" />
                    )}
                    Copy Audit History to Firestore
                  </button>
                  <button
                    className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-violet-400/40 bg-violet-400/10 font-bold text-violet-100 disabled:opacity-50"
                    disabled={busy || blocked}
                    onClick={verifySource}
                    type="button"
                  >
                    <ShieldCheck className="h-5 w-5" />
                    Verify Firestore Copy
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {error ? <Notice success={false} text={error} /> : null}
          {runId ? (
            <Notice
              success
              text={"Audit History migration completed. Run ID: " + runId}
            />
          ) : null}
          {verification ? (
            <div
              className={
                "m-6 rounded-xl border p-4 text-sm sm:m-8 " +
                (verification.verified
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                  : "border-amber-400/30 bg-amber-400/10 text-amber-100")
              }
            >
              <p className="font-bold">
                {verification.verified
                  ? "Firestore Audit History verified exactly."
                  : "Verification found differences."}
              </p>
              {Object.keys(verification.expected).map((key) => (
                <p className="mt-2" key={key}>
                  {key}: {verification.actual[key]} /{" "}
                  {verification.expected[key]}
                </p>
              ))}
              {verification.mismatches.map((item) => (
                <p className="mt-1 break-words" key={item}>
                  {item}
                </p>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Input({
  label,
  type,
  value,
  onChange
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <input
        className="mt-2 h-12 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 outline-none focus:border-violet-400"
        onChange={(event) => onChange(event.target.value)}
        required
        type={type}
        value={value}
      />
    </label>
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

function Notice({ success, text }: { success: boolean; text: string }) {
  return (
    <div
      className={
        "m-6 flex gap-3 rounded-xl border p-4 text-sm sm:m-8 " +
        (success
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
          : "border-rose-400/30 bg-rose-400/10 text-rose-100")
      }
      role={success ? "status" : "alert"}
    >
      {success ? (
        <CheckCircle2 className="h-5 w-5 shrink-0" />
      ) : (
        <TriangleAlert className="h-5 w-5 shrink-0" />
      )}
      <p className="break-words">{text}</p>
    </div>
  );
}
