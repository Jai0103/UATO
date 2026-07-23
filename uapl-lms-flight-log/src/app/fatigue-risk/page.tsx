"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FileClock,
  Loader2,
  RotateCcw,
  Save,
  ShieldCheck,
  Upload,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import { getSecureSession, type SecureSession } from "@/lib/auth-api";
import {
  createEmptyFatigueRiskRecord,
  createFatigueResponses,
  currentWeekMonday,
  FATIGUE_RISK_QUESTIONS,
  FATIGUE_RISK_SECTIONS,
  isMondayDate,
  type FatigueResponseValue,
  type FatigueRiskRecord
} from "@/lib/fatigue-risk";
import {
  fetchFatigueRiskRecord,
  saveFatigueRiskRecord
} from "@/lib/fatigue-risk-api";
import {
  createFatigueRiskPdf,
  fatigueRiskPdfFileName
} from "@/lib/fatigue-risk-pdf";

function formatDate(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("en-SG", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
}

function normalizeRecord(record: FatigueRiskRecord) {
  return {
    ...record,
    responses: createFatigueResponses(record.responses || []),
    evaluatorPosition: record.evaluatorPosition || "Head of Training",
    status: record.status === "reviewed" ? "reviewed" : "submitted"
  } satisfies FatigueRiskRecord;
}

export default function FatigueRiskPage() {
  const message = useAppMessage();
  const [session, setSession] = useState<SecureSession | null>(null);
  const [record, setRecord] = useState<FatigueRiskRecord>(
    createEmptyFatigueRiskRecord("", "")
  );
  const [loadingLabel, setLoadingLabel] = useState(
    "Loading this week's checklist..."
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadChecklist() {
      const storedSession = getSecureSession();
      if (!storedSession) return;
      setSession(storedSession);

      try {
        const recordId = new URLSearchParams(window.location.search).get("id");
        const saved = recordId
          ? await fetchFatigueRiskRecord(recordId)
          : null;

        if (!active) return;
        setRecord(
          saved
            ? normalizeRecord(saved)
            : createEmptyFatigueRiskRecord(
                "",
                "",
                storedSession.name
              )
        );
      } catch (error) {
        if (!active) return;
        setRecord(
          createEmptyFatigueRiskRecord(
            "",
            "",
            storedSession.name
          )
        );
        message.error(
          "Checklist could not be loaded",
          error instanceof Error
            ? error.message
            : "The weekly checklist is temporarily unavailable."
        );
      } finally {
        if (active) setLoadingLabel("");
      }
    }

    void loadChecklist();
    return () => {
      active = false;
    };
  }, []);

  const responseMap = useMemo(
    () =>
      new Map(
        record.responses.map((response) => [
          response.questionId,
          response.response
        ])
      ),
    [record.responses]
  );

  const answeredCount = record.responses.filter(
    (response) => response.response
  ).length;
  const riskCount = record.responses.filter(
    (response) => response.response === "yes"
  ).length;
  const progress = Math.round(
    (answeredCount / FATIGUE_RISK_QUESTIONS.length) * 100
  );
  const isCurrentWeek = record.assessmentDate === currentWeekMonday();

  function updateRecord(patch: Partial<FatigueRiskRecord>) {
    setRecord((current) => ({ ...current, ...patch }));
  }

  function setResponse(
    questionId: string,
    response: FatigueResponseValue
  ) {
    setRecord((current) => ({
      ...current,
      responses: current.responses.map((item) =>
        item.questionId === questionId ? { ...item, response } : item
      )
    }));
  }

  async function markAllNo() {
    const confirmed = await message.confirm({
      title: "Mark every item No?",
      message:
        "This will replace every current checklist answer with No, indicating that no fatigue risks were identified.",
      confirmLabel: "Mark all No",
      cancelLabel: "Cancel"
    });
    if (!confirmed) return;

    setRecord((current) => ({
      ...current,
      responses: current.responses.map((item) => ({
        ...item,
        response: "no"
      }))
    }));
    message.success(
      "All items marked No",
      `${FATIGUE_RISK_QUESTIONS.length} checklist items were completed. Review the answers before saving.`
    );
  }

  function validationError() {
    if (!record.instructorName.trim()) {
      return "The instructor or AFE name is required.";
    }
    if (!isMondayDate(record.assessmentDate)) {
      return "The checklist date must be a Monday.";
    }
    if (answeredCount !== FATIGUE_RISK_QUESTIONS.length) {
      return `Complete all ${FATIGUE_RISK_QUESTIONS.length} checklist items before saving.`;
    }
    if (!record.recommendation.trim()) {
      return "Enter the Head of Training recommendation.";
    }
    if (!record.evaluatedBy.trim()) {
      return "Enter the Head of Training evaluator name.";
    }
    if (!record.signatureDataUrl) {
      return "Upload the Head of Training signature.";
    }
    return "";
  }

  async function saveChecklist() {
    const error = validationError();
    if (error) {
      message.warning("Checklist is incomplete", error);
      return;
    }

    setSaving(true);
    try {
      const saved = await saveFatigueRiskRecord({
        ...record,
        instructorName: record.instructorName.trim(),
        instructorEmail: record.instructorEmail.trim(),
        recommendation: record.recommendation.trim(),
        evaluatedBy: record.evaluatedBy.trim(),
        evaluatorPosition:
          record.evaluatorPosition.trim() || "Head of Training",
        status: "reviewed"
      });
      setRecord(normalizeRecord(saved));
      message.success(
        "Weekly checklist saved",
        "The Head of Training checklist and signature were saved."
      );
    } catch (error) {
      message.error(
        "Checklist save failed",
        error instanceof Error
          ? error.message
          : "The fatigue-risk checklist could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }

  async function preparePdf(mode: "preview" | "download") {
    const error = validationError();
    if (error) {
      message.warning("Report is not ready", error);
      return;
    }

    setLoadingLabel(
      mode === "preview"
        ? "Preparing report preview..."
        : "Preparing PDF download..."
    );
    try {
      const doc = await createFatigueRiskPdf(record);
      if (mode === "download") {
        doc.save(fatigueRiskPdfFileName(record));
      } else {
        const url = doc.output("bloburl");
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      message.error(
        "PDF generation failed",
        error instanceof Error
          ? error.message
          : "The report could not be generated."
      );
    } finally {
      setLoadingLabel("");
    }
  }

  async function handleSignature(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 3 * 1024 * 1024) {
      message.warning(
        "Invalid signature image",
        "Use a PNG or JPG image smaller than 3 MB."
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () =>
      updateRecord({ signatureDataUrl: String(reader.result || "") });
    reader.readAsDataURL(file);
  }

  async function clearChecklist() {
    const confirmed = await message.confirm({
      title: "Clear this checklist?",
      message:
        "All unsaved Yes and No selections on this screen will be removed.",
      confirmLabel: "Clear checklist",
      variant: "danger"
    });
    if (!confirmed || !session) return;
    setRecord(
      createEmptyFatigueRiskRecord("", "", session.name)
    );
  }

  return (
    <AppShell>
      {loadingLabel ? <LoadingOverlay label={loadingLabel} /> : null}

      <div className="app-page pb-28 lg:pb-0">
        <section className="app-page-header">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-md bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700 ring-1 ring-sky-100">
                <ClipboardCheck className="h-3.5 w-3.5" />
                ADA-UATO-2G
              </div>
              <h1 className="mt-3 text-2xl font-bold text-slate-950 sm:text-3xl">
                Fatigue Risk Identification
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                Completed by the Head of Training every Monday before the
                week&apos;s training activities begin.
              </p>
            </div>

            <Link
              href="/fatigue-risk/records"
              className="app-button-secondary w-full sm:w-auto"
            >
              <FileClock className="h-4 w-4" />
              Previous checklists
            </Link>
          </div>
        </section>

        <section
          className={`rounded-lg border p-4 sm:p-5 ${
            isCurrentWeek
              ? "border-emerald-200 bg-emerald-50/70"
              : "border-amber-200 bg-amber-50/70"
          }`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                  isCurrentWeek
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                <CalendarDays className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-slate-500">
                  Week commencing
                </p>
                <p className="mt-1 text-base font-bold text-slate-950">
                  {formatDate(record.assessmentDate)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {record.id
                    ? "This saved checklist can be updated."
                    : "A new Monday checklist is ready to complete."}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex">
              <div className="rounded-lg border border-white/80 bg-white px-4 py-2.5 shadow-sm">
                <p className="text-xl font-bold text-slate-950">
                  {answeredCount}/{FATIGUE_RISK_QUESTIONS.length}
                </p>
                <p className="text-[11px] font-bold uppercase text-slate-500">
                  Answered
                </p>
              </div>
              <div className="rounded-lg border border-white/80 bg-white px-4 py-2.5 shadow-sm">
                <p
                  className={`text-xl font-bold ${
                    riskCount ? "text-rose-700" : "text-emerald-700"
                  }`}
                >
                  {riskCount}
                </p>
                <p className="text-[11px] font-bold uppercase text-slate-500">
                  Risks identified
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="app-card">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
            <div>
              <label className="text-sm font-semibold text-slate-800">
                Instructor / AFE Name
              </label>
              <input
                value={record.instructorName}
                onChange={(event) =>
                  updateRecord({ instructorName: event.target.value })
                }
                placeholder="Enter the Instructor or AFE name"
                className="mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Enter the person being assessed for this training week.
              </p>
            </div>
            <div>
              <label
                htmlFor="fatigue-assessment-date"
                className="text-sm font-semibold text-slate-800"
              >
                Monday assessment date
              </label>
              <input
                id="fatigue-assessment-date"
                type="date"
                value={record.assessmentDate}
                onChange={(event) =>
                  updateRecord({ assessmentDate: event.target.value })
                }
                className="mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
              />
              {!isMondayDate(record.assessmentDate) ? (
                <p className="mt-1.5 text-xs font-semibold text-rose-600">
                  Select a Monday.
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
              <span>Checklist progress</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-sky-600 transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">
              Bulk checklist action
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Use this only when every checklist item should be recorded as
              No. You can still change individual answers afterward.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void markAllNo()}
            className="flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:w-auto"
          >
            <CheckCircle2 className="h-4 w-4" />
            Mark all No
          </button>
        </section>

        {FATIGUE_RISK_SECTIONS.map((section, sectionIndex) => {
          const questions = FATIGUE_RISK_QUESTIONS.filter(
            (question) => question.sectionId === section.id
          );
          const completed = questions.filter((question) =>
            responseMap.get(question.id)
          ).length;

          return (
            <section key={section.id} className="app-card overflow-hidden p-0">
              <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
                    {sectionIndex + 1}
                  </span>
                  <h2 className="text-base font-bold text-slate-950">
                    {section.label}
                  </h2>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                    completed === questions.length
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-white text-slate-500 ring-1 ring-slate-200"
                  }`}
                >
                  {completed}/{questions.length}
                </span>
              </header>

              <div className="divide-y divide-slate-100">
                {questions.map((question, index) => {
                  const selected = responseMap.get(question.id) || "";
                  return (
                    <div
                      key={question.id}
                      className={`grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center ${
                        selected === "yes" ? "bg-rose-50/55" : "bg-white"
                      }`}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-600">
                          {index + 1}
                        </span>
                        <p className="text-sm leading-6 text-slate-700">
                          {question.question}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {(["yes", "no"] as const).map((value) => {
                          const active = selected === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setResponse(question.id, value)}
                              className={`flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-sky-400 ${
                                active && value === "yes"
                                  ? "border-rose-600 bg-rose-600 text-white shadow-sm"
                                  : active
                                    ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                                    : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50"
                              }`}
                              aria-pressed={active}
                            >
                              {active ? (
                                <Check className="h-4 w-4" />
                              ) : null}
                              {value === "yes" ? "Yes" : "No"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {riskCount ? (
          <section className="rounded-lg border border-rose-200 bg-rose-50 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
              <div>
                <h2 className="font-bold text-rose-950">
                  {riskCount} potential fatigue{" "}
                  {riskCount === 1 ? "risk was" : "risks were"} identified
                </h2>
                <p className="mt-1 text-sm leading-6 text-rose-800">
                  These Yes responses should be considered by the Head of
                  Training before training activity continues.
                </p>
              </div>
            </div>
          </section>
        ) : answeredCount === FATIGUE_RISK_QUESTIONS.length ? (
          <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <div>
                <h2 className="font-bold text-emerald-950">
                  No fatigue risks were identified
                </h2>
                <p className="mt-1 text-sm text-emerald-800">
                  All checklist responses have been completed.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="app-card">
          <div className="flex items-start gap-3 border-b border-slate-200 pb-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-indigo-700">
                Administrative review
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">
                Recommendation by Head of Training
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Complete this section after reviewing all checklist responses.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="fatigue-recommendation"
                className="text-sm font-semibold text-slate-800"
              >
                Recommendation
              </label>
              <textarea
                id="fatigue-recommendation"
                rows={4}
                value={record.recommendation}
                onChange={(event) =>
                  updateRecord({ recommendation: event.target.value })
                }
                placeholder="Enter the Head of Training recommendation"
                className="mt-2 w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-base leading-6 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="fatigue-evaluator"
                  className="text-sm font-semibold text-slate-800"
                >
                  Evaluated By
                </label>
                <input
                  id="fatigue-evaluator"
                  value={record.evaluatedBy}
                  onChange={(event) =>
                    updateRecord({ evaluatedBy: event.target.value })
                  }
                  className="mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
                />
              </div>
              <div>
                <label
                  htmlFor="fatigue-position"
                  className="text-sm font-semibold text-slate-800"
                >
                  Position
                </label>
                <input
                  id="fatigue-position"
                  value={record.evaluatorPosition}
                  onChange={(event) =>
                    updateRecord({ evaluatorPosition: event.target.value })
                  }
                  className="mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-800">
                Head of Training signature
              </label>
              {record.signatureDataUrl ? (
                <div className="mt-2 flex min-h-36 items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <img
                    src={record.signatureDataUrl}
                    alt="Head of Training signature"
                    className="max-h-24 max-w-[75%] object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => updateRecord({ signatureDataUrl: "" })}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600"
                    aria-label="Remove signature"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="mt-2 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-4 text-center transition hover:border-sky-500 hover:bg-sky-50">
                  <Upload className="h-5 w-5 text-sky-700" />
                  <span className="mt-2 text-sm font-semibold text-slate-800">
                    Upload signature image
                  </span>
                  <span className="mt-1 text-xs text-slate-500">
                    PNG or JPG, maximum 3 MB
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) =>
                      void handleSignature(event.target.files?.[0])
                    }
                  />
                </label>
              )}
            </div>
          </div>
        </section>

        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:static lg:z-auto lg:rounded-lg lg:border lg:px-5 lg:py-4 lg:shadow-sm">
          <div className="mx-auto grid max-w-[1600px] grid-cols-4 gap-2 lg:flex lg:justify-end">
            <button
              type="button"
              onClick={() => void clearChecklist()}
              className="flex h-12 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 lg:w-12"
              aria-label="Clear checklist"
              title="Clear checklist"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void preparePdf("preview")}
              className="flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
            >
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline">Preview</span>
            </button>
            <button
              type="button"
              onClick={() => void preparePdf("download")}
              className="flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">PDF</span>
            </button>
            <button
              type="button"
              onClick={() => void saveChecklist()}
              disabled={saving}
              className="flex h-12 items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60 lg:min-w-44"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {saving ? "Saving..." : "Save checklist"}
              </span>
            </button>
          </div>
        </footer>
      </div>
    </AppShell>
  );
}
