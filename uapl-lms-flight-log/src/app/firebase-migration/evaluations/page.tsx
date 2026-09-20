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
  MessageSquareText,
  ShieldCheck,
  TriangleAlert
} from "lucide-react";
import { FormEvent, useState } from "react";
import { sessionKey } from "@/lib/demo-auth";
import { firebaseAuth, firestore } from "@/lib/firebase-client";
import {
  analyzeEvaluationMigration,
  loadGoogleEvaluationSource,
  migrateEvaluationsToFirestore,
  verifyEvaluationMigration,
  type EvaluationMigrationAnalysis,
  type EvaluationMigrationProgress,
  type EvaluationMigrationVerification
} from "@/lib/evaluations-firebase-migration";

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

export default function EvaluationMigrationPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [admin, setAdmin] = useState<ConnectedAdmin | null>(null);
  const [analysis, setAnalysis] = useState<EvaluationMigrationAnalysis | null>(null);
  const [verification, setVerification] =
    useState<EvaluationMigrationVerification | null>(null);
  const [progress, setProgress] = useState<EvaluationMigrationProgress | null>(null);
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
      const profile = await getDoc(doc(firestore, "users", credential.user.uid));
      if (
        !profile.exists() ||
        profile.data().status !== "active" ||
        profile.data().role !== "admin"
      ) {
        throw new Error("Only an active Firebase administrator can run migration.");
      }
      setAdmin({
        uid: credential.user.uid,
        email: String(profile.data().email || credential.user.email || ""),
        name: String(profile.data().name || credential.user.email || "Administrator")
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
      const source = await loadGoogleEvaluationSource(setProgress);
      setAnalysis(analyzeEvaluationMigration(source));
    } catch (analysisError) {
      setError(readableError(analysisError));
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  async function copySource() {
    if (!admin || !analysis) return;
    setBusy(true);
    setError("");
    setVerification(null);
    try {
      const result = await migrateEvaluationsToFirestore(
        analysis,
        { uid: admin.uid, email: admin.email },
        setProgress
      );
      setRunId(result.runId);
    } catch (migrationError) {
      setError(readableError(migrationError));
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  async function verifyCopy() {
    if (!analysis) return;
    setBusy(true);
    setError("");
    try {
      setVerification(await verifyEvaluationMigration(analysis));
    } catch (verificationError) {
      setError(readableError(verificationError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/30">
          <header className="border-b border-slate-700 px-6 py-6 sm:px-8">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-violet-400/10 text-violet-300">
              <MessageSquareText className="h-5 w-5" />
            </div>
            <p className="text-xs font-bold uppercase text-violet-300">
              Administrator migration utility
            </p>
            <h1 className="mt-2 text-2xl font-bold text-white">
              Student Evaluations
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Copy sessions, responses, versioned questions, and individual answers to Firestore without changing Google Sheets.
            </p>
          </header>

          {!admin ? (
            <form className="space-y-5 px-6 py-6 sm:px-8" onSubmit={connectFirebase}>
              <label className="block text-sm font-semibold text-slate-200">
                Firebase admin email
                <input
                  autoComplete="username"
                  className="mt-2 h-12 w-full rounded-lg border border-slate-600 bg-slate-950 px-4 text-white outline-none focus:border-violet-400"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>
              <label className="block text-sm font-semibold text-slate-200">
                Firebase password
                <input
                  autoComplete="current-password"
                  className="mt-2 h-12 w-full rounded-lg border border-slate-600 bg-slate-950 px-4 text-white outline-none focus:border-violet-400"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
              <button
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-violet-400 px-4 text-sm font-bold text-slate-950 disabled:opacity-60"
                disabled={busy}
                type="submit"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                Connect Firebase administrator
              </button>
            </form>
          ) : (
            <div className="space-y-5 px-6 py-6 sm:px-8">
              <div className="flex gap-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                <div>
                  <p className="font-bold text-emerald-100">Firebase admin connected</p>
                  <p className="text-sm text-emerald-200/80">{admin.name} - {admin.email}</p>
                </div>
              </div>
              <button
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-4 text-sm font-bold text-white disabled:opacity-60"
                disabled={busy}
                onClick={analyzeSource}
                type="button"
              >
                {busy && !analysis ? <Loader2 className="h-5 w-5 animate-spin" /> : <DatabaseZap className="h-5 w-5" />}
                Analyze Google Sheets Evaluations
              </button>

              {analysis ? (
                <section className="rounded-lg border border-slate-700 bg-slate-950 p-5">
                  <h2 className="text-lg font-bold">Migration review</h2>
                  <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {[
                      ["Questions", analysis.questions.length],
                      ["Sessions", analysis.sessionCount],
                      ["Session questions", analysis.sessionQuestionCount],
                      ["Responses", analysis.responseCount],
                      ["Answers", analysis.answerCount]
                    ].map(([label, value]) => (
                      <div className="rounded-lg bg-slate-900 p-3" key={String(label)}>
                        <dt className="text-xs text-slate-400">{label}</dt>
                        <dd className="mt-1 text-xl font-bold">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <button
                    className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-bold text-slate-950 disabled:opacity-60"
                    disabled={busy}
                    onClick={copySource}
                    type="button"
                  >
                    <DatabaseZap className="h-5 w-5" /> Copy Evaluations to Firestore
                  </button>
                  <button
                    className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-violet-400/40 bg-violet-400/10 px-4 text-sm font-bold text-violet-100 disabled:opacity-60"
                    disabled={busy}
                    onClick={verifyCopy}
                    type="button"
                  >
                    <ShieldCheck className="h-5 w-5" /> Verify Firestore Copy
                  </button>
                </section>
              ) : null}
            </div>
          )}

          {progress ? (
            <div className="border-t border-slate-700 px-6 py-5 sm:px-8">
              <div className="flex justify-between gap-4 text-sm">
                <span>{progress.label}</span>
                <strong>{progress.current}/{progress.total}</strong>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-violet-400"
                  style={{ width: `${progress.total ? Math.round((progress.current / progress.total) * 100) : 0}%` }}
                />
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="m-6 flex gap-3 rounded-lg border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100 sm:m-8">
              <TriangleAlert className="h-5 w-5 shrink-0" />
              <p>{error}</p>
            </div>
          ) : null}

          {runId ? (
            <div className="m-6 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100 sm:m-8">
              <p className="font-bold">Student Evaluation migration completed.</p>
              <p className="mt-1 break-all">Run ID: {runId}</p>
            </div>
          ) : null}

          {verification ? (
            <div className={`m-6 rounded-lg border p-4 text-sm sm:m-8 ${verification.verified ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-amber-400/30 bg-amber-400/10 text-amber-100"}`}>
              <p className="font-bold">
                {verification.verified ? "Firestore Student Evaluations verified exactly." : "Verification found differences."}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.keys(verification.expected).map((key) => (
                  <div className="rounded-lg bg-slate-950/40 p-3" key={key}>
                    <p className="text-xs capitalize opacity-75">{key}</p>
                    <p className="mt-1 font-bold">{verification.actual[key]} / {verification.expected[key]}</p>
                  </div>
                ))}
              </div>
              {verification.mismatches.map((item) => <p className="mt-2" key={item}>{item}</p>)}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
