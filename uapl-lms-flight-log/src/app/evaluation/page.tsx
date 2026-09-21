"use client";

import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  Loader2,
  MapPin,
  RefreshCw,
  Send,
  ShieldCheck,
  Star,
  UserRound,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useAppMessage } from "@/components/message-provider";
import {
  EvaluationApiError,
  evaluationRatingFields,
  fetchPublicEvaluationSession,
  submitPublicEvaluation,
  type EvaluationRatingField,
  type EvaluationRatings,
  type PublicEvaluationAnswer,
  type PublicEvaluationQuestion,
  type PublicEvaluationReceipt,
  type PublicEvaluationSession,
} from "@/lib/evaluations";
import {
  isQuestionApplicable,
  isStandardEvaluation,
  STANDARD_EVALUATION_SECTIONS
} from "@/lib/evaluation-standard-questions";

const LOGO_PATH = "/UATO/AGA_Logo_fullcolor_Horizontal%20(1).png";
const DEVICE_KEY_STORAGE = "uapl-evaluation-device-key-v1";

function emptyRatings(): EvaluationRatings {
  return evaluationRatingFields.reduce((ratings, field) => {
    ratings[field] = 0;
    return ratings;
  }, {} as EvaluationRatings);
}

function createDeviceKey() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function getDeviceKey() {
  try {
    const stored = localStorage.getItem(DEVICE_KEY_STORAGE);
    if (stored && stored.length >= 16) return stored;

    const created = createDeviceKey();
    localStorage.setItem(DEVICE_KEY_STORAGE, created);
    return created;
  } catch {
    return createDeviceKey();
  }
}

function formatTrainingDate(value: string) {
  if (!value) return "Date not specified";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function EvaluationPage() {
  const message = useAppMessage();
  const [token, setToken] = useState("");
  const [submissionKey, setSubmissionKey] = useState("");
  const [formStartedAt, setFormStartedAt] = useState(0);
  const [session, setSession] = useState<PublicEvaluationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<PublicEvaluationReceipt | null>(null);
  const [studentName, setStudentName] = useState("");
  const [company, setCompany] = useState("");
  const [trainingComponent, setTrainingComponent] = useState<"" | "Theory" | "Practical" | "Both">("");
  const [theoryDelivery, setTheoryDelivery] = useState<"" | "In person" | "Online synchronous">("");
  const [step, setStep] = useState(0);
  const [ratings, setRatings] = useState<EvaluationRatings>(emptyRatings);
  const [answers, setAnswers] = useState<Record<string, PublicEvaluationAnswer>>({});
  const [recommendTraining, setRecommendTraining] = useState<
    "" | "yes" | "no"
  >("");
  const [mostUseful, setMostUseful] = useState("");
  const [improvements, setImprovements] = useState("");
  const [additionalComments, setAdditionalComments] = useState("");
  const [website, setWebsite] = useState("");

  const modern = isStandardEvaluation(session?.questions || []);
  const visibleQuestions = (session?.questions || []).filter((question) =>
    !modern || isQuestionApplicable(question, trainingComponent, theoryDelivery)
  );
  const visibleSections = modern
    ? STANDARD_EVALUATION_SECTIONS.filter((section) => visibleQuestions.some((question) => question.section === section))
    : [];
  const finalStep = modern ? visibleSections.length + 1 : 0;
  const requiredQuestions = visibleQuestions.filter((question) => question.required);
  const completedRequired = requiredQuestions.filter((question) => {
    const answer = answers[question.id];
    return question.responseType === "rating"
      ? Number(answer?.rating) >= question.scaleMin
      : Boolean(answer?.value?.trim());
  }).length;
  const progress = requiredQuestions.length
    ? Math.round((completedRequired / requiredQuestions.length) * 100)
    : 100;

  async function loadEvaluation(nextToken: string, nextKey: string) {
    setLoading(true);
    setLoadError("");

    try {
      const loadedSession = await fetchPublicEvaluationSession(
        nextToken,
        nextKey
      );
      setSession(loadedSession);
      setStep(0);
      setAnswers(
        Object.fromEntries(
          loadedSession.questions.map((question) => [
            question.id,
            { questionId: question.id }
          ])
        )
      );
      setFormStartedAt(Date.now());
    } catch (error) {
      setLoadError(
        error instanceof EvaluationApiError
          ? error.message
          : "Unable to load this evaluation."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const nextToken = new URLSearchParams(window.location.search)
      .get("token")
      ?.trim();
    const nextKey = getDeviceKey();

    setToken(nextToken || "");
    setSubmissionKey(nextKey);

    if (!nextToken) {
      setLoadError(
        "This evaluation link is incomplete. Scan the QR code again."
      );
      setLoading(false);
      return;
    }

    void loadEvaluation(nextToken, nextKey);
  }, []);

  function updateAnswer(questionId: string, update: Partial<PublicEvaluationAnswer>) {
    setAnswers((current) => ({
      ...current,
      [questionId]: { ...current[questionId], ...update, questionId }
    }));
    if (evaluationRatingFields.includes(questionId as EvaluationRatingField) && update.rating) {
      setRatings((current) => ({
        ...current,
        [questionId as EvaluationRatingField]: update.rating || 0
      }));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || submitting) return;

    if (modern && (!studentName.trim() || !company.trim() || !trainingComponent ||
      (trainingComponent !== "Practical" && !theoryDelivery))) {
      message.warning("Learner details required", "Enter your name and organisation, then select the training component and theory delivery where applicable.");
      setStep(0);
      return;
    }
    if (completedRequired !== requiredQuestions.length) {
      message.warning(
        "Complete required questions",
        "Answer every question marked as required before submitting."
      );
      return;
    }

    if (!recommendTraining) {
      message.warning(
        "Recommendation required",
        "Select whether you would recommend this training."
      );
      return;
    }

    setSubmitting(true);
    message.notify({
      type: "loading",
      title: "Submitting evaluation",
      message: "Please keep this page open.",
    });

    try {
      const submitted = await submitPublicEvaluation({
        token,
        submissionKey,
        formStartedAt,
        studentName: studentName.trim(),
        company: company.trim(),
        trainingComponent: trainingComponent || undefined,
        theoryDeliveryMode: trainingComponent === "Practical" ? undefined : theoryDelivery || undefined,
        ratings,
        answers: visibleQuestions.map((question) =>
          answers[question.id] || { questionId: question.id }
        ),
        recommendTraining,
        mostUseful: mostUseful.trim(),
        improvements: improvements.trim(),
        additionalComments: additionalComments.trim(),
        website,
      });

      setReceipt(submitted);
      message.success(
        "Evaluation submitted",
        "Thank you for sharing your feedback."
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      message.error(
        "Submission failed",
        error instanceof EvaluationApiError
          ? error.message
          : "Your evaluation could not be submitted. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#eef3f8] text-slate-700">
      <div className="h-1 bg-sky-700" />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <img
            src={LOGO_PATH}
            alt="Apollo Global Academy"
            className="h-auto max-h-14 w-auto max-w-[190px] object-contain sm:max-w-[230px]"
          />
          <div className="hidden items-center gap-2 text-xs font-semibold text-slate-500 sm:flex">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Secure feedback form
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-9">
        {loading ? (
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
            <div className="h-1 bg-sky-600" />
            <div className="flex min-h-48 items-center justify-center gap-4 p-6">
              <Loader2 className="h-6 w-6 animate-spin text-sky-700" />
              <div>
                <h1 className="font-bold text-slate-950">
                  Loading evaluation
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Checking the evaluation session...
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {!loading && loadError ? (
          <StatePanel
            icon={AlertTriangle}
            iconClass="bg-amber-50 text-amber-700 ring-amber-200"
            title="Evaluation unavailable"
            message={loadError}
            action={
              token && submissionKey
                ? {
                    label: "Try again",
                    onClick: () => void loadEvaluation(token, submissionKey),
                  }
                : undefined
            }
          />
        ) : null}

        {!loading && !loadError && session?.alreadySubmitted ? (
          <StatePanel
            icon={CheckCircle2}
            iconClass="bg-emerald-50 text-emerald-700 ring-emerald-200"
            title="Evaluation already submitted"
            message="A response for this training has already been received from this device. Thank you for your feedback."
          />
        ) : null}

        {!loading &&
        !loadError &&
        session &&
        !session.available &&
        !session.alreadySubmitted ? (
          <StatePanel
            icon={AlertTriangle}
            iconClass="bg-amber-50 text-amber-700 ring-amber-200"
            title="Evaluation unavailable"
            message={
              session.unavailableReason ||
              "This evaluation is not accepting responses."
            }
          />
        ) : null}

        {!loading &&
        !loadError &&
        session?.available &&
        !session.alreadySubmitted &&
        receipt ? (
          <StatePanel
            icon={CheckCircle2}
            iconClass="bg-emerald-50 text-emerald-700 ring-emerald-200"
            title="Thank you for your feedback"
            message="Your evaluation has been recorded successfully. You may now close this page."
            reference={receipt.responseId}
          />
        ) : null}

        {!loading &&
        !loadError &&
        session?.available &&
        !session.alreadySubmitted &&
        !receipt ? (
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg shadow-slate-200/50">
              <div className="h-1 bg-sky-700" />
              <div className="p-5 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase text-sky-700">
                      Student evaluation
                    </p>
                    <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">
                      {session.courseName}
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                      Your feedback supports the quality and continuous
                      improvement of our training.
                    </p>
                  </div>
                  <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 ring-1 ring-sky-200 sm:flex">
                    <Star className="h-6 w-6" />
                  </div>
                </div>

                <div className="mt-6 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-3">
                  <SessionDetail
                    icon={UserRound}
                    label="Trainer"
                    value={session.trainerName}
                  />
                  <SessionDetail
                    icon={CalendarDays}
                    label="Training date"
                    value={formatTrainingDate(session.trainingDate)}
                  />
                  <SessionDetail
                    icon={MapPin}
                    label="Location"
                    value={session.location}
                  />
                </div>
              </div>
            </section>

            {(!modern || step === 0) ? <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <SectionHeading
                number="01"
                title="Learner & course information"
                description={modern ? "Your course, date and trainer are linked to this QR code." : "These fields are optional. You may submit anonymously."}
              />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label={modern ? "Name of learner *" : "Name (optional)"}>
                  <input
                    value={studentName}
                    onChange={(event) => setStudentName(event.target.value)}
                    className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-base text-slate-800 outline-none transition focus:border-sky-600 focus:ring-4 focus:ring-sky-100 sm:text-sm"
                    placeholder="Enter your name"
                    maxLength={120}
                    autoComplete="name"
                  />
                </Field>
                <Field label={modern ? "Company / organisation *" : "Company / organisation (optional)"}>
                  <input
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                    className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-base text-slate-800 outline-none transition focus:border-sky-600 focus:ring-4 focus:ring-sky-100 sm:text-sm"
                    placeholder="Enter company or organisation"
                    maxLength={160}
                    autoComplete="organization"
                  />
                </Field>
              </div>
              {modern ? <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Training component completed *">
                  <select value={trainingComponent} onChange={(event) => { setTrainingComponent(event.target.value as typeof trainingComponent); setStep(0); }} className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-800 sm:text-sm">
                    <option value="">Select component</option><option>Theory</option><option>Practical</option><option>Both</option>
                  </select>
                </Field>
                {trainingComponent !== "Practical" ? <Field label="Theory delivery *">
                  <select value={theoryDelivery} onChange={(event) => setTheoryDelivery(event.target.value as typeof theoryDelivery)} className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-800 sm:text-sm">
                    <option value="">Select format</option><option>In person</option><option>Online synchronous</option>
                  </select>
                </Field> : null}
              </div> : null}

              <label className="absolute left-[-9999px]" aria-hidden="true">
                Website
                <input
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </label>
            </section> : null}

            {(!modern || (step > 0 && step <= visibleSections.length)) ? <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <SectionHeading
                  number="02"
                  title={modern ? visibleSections[step - 1] : "Training experience"}
                  description="Select how strongly you agree with each statement."
                />
                <div className="min-w-28 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-right">
                  <p className="text-xs font-bold text-sky-700">PROGRESS</p>
                  <p className="mt-0.5 text-lg font-bold text-slate-950">
                    {progress}%
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {visibleQuestions.filter((question) => !modern || question.section === visibleSections[step - 1]).map((question, questionIndex) => (
                  <DynamicQuestion
                    key={question.id}
                    question={question}
                    index={questionIndex + 1}
                    answer={answers[question.id]}
                    onChange={(update) => updateAnswer(question.id, update)}
                  />
                ))}
              </div>

              {!modern ? <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-900">
                  Would you recommend this training to others?
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {(["yes", "no"] as const).map((option) => {
                    const selected = recommendTraining === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setRecommendTraining(option)}
                        className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-bold transition ${
                          selected
                            ? "border-sky-700 bg-sky-700 text-white shadow-md"
                            : "border-slate-300 bg-white text-slate-700 hover:border-sky-400 hover:bg-sky-50"
                        }`}
                        aria-pressed={selected}
                      >
                        {selected ? <Check className="h-4 w-4" /> : null}
                        {option === "yes" ? "Yes" : "No"}
                      </button>
                    );
                  })}
                </div>
              </div> : null}
            </section> : null}

            {(!modern || step === finalStep) ? <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <SectionHeading
                number="03"
                title="Overall feedback & comments"
                description="Optional comments help us understand your ratings."
              />
              {modern ? <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-900">Would you recommend this course?</p>
                <div className="mt-3 grid grid-cols-2 gap-3">{(["yes", "no"] as const).map((option) => <button key={option} type="button" onClick={() => setRecommendTraining(option)} aria-pressed={recommendTraining === option} className={`min-h-12 rounded-lg border text-sm font-bold ${recommendTraining === option ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{option === "yes" ? "Yes" : "No"}</button>)}</div>
              </div> : null}
              <div className="mt-5 space-y-5">
                <Field label="What was the most useful part of the training?">
                  <textarea
                    value={mostUseful}
                    onChange={(event) => setMostUseful(event.target.value)}
                    className="min-h-28 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base leading-6 text-slate-800 outline-none transition focus:border-sky-600 focus:ring-4 focus:ring-sky-100 sm:text-sm"
                    placeholder="Share what helped you most"
                    maxLength={1200}
                  />
                </Field>
                <Field label="What could we improve?">
                  <textarea
                    value={improvements}
                    onChange={(event) => setImprovements(event.target.value)}
                    className="min-h-28 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base leading-6 text-slate-800 outline-none transition focus:border-sky-600 focus:ring-4 focus:ring-sky-100 sm:text-sm"
                    placeholder="Share any suggestions"
                    maxLength={1200}
                  />
                </Field>
                <Field label="Additional comments">
                  <textarea
                    value={additionalComments}
                    onChange={(event) =>
                      setAdditionalComments(event.target.value)
                    }
                    className="min-h-28 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base leading-6 text-slate-800 outline-none transition focus:border-sky-600 focus:ring-4 focus:ring-sky-100 sm:text-sm"
                    placeholder="Anything else you would like us to know"
                    maxLength={1200}
                  />
                </Field>
              </div>
            </section> : null}

            <div className="sticky bottom-0 z-20 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-12px_30px_rgba(15,23,42,0.09)] backdrop-blur sm:static sm:mx-0 sm:rounded-lg sm:border sm:p-4 sm:shadow-sm">
              <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
                <p className="hidden text-xs leading-5 text-slate-500 sm:block">
                  Review your ratings before submitting. Responses cannot be
                  edited afterward.
                </p>
                {modern && step > 0 ? <button type="button" onClick={() => { setStep((current) => current - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="min-h-12 rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700">Back</button> : null}
                <button
                  type={modern && step < finalStep ? "button" : "submit"}
                  onClick={modern && step < finalStep ? () => {
                    if (step === 0 && (!studentName.trim() || !company.trim() || !trainingComponent || (trainingComponent !== "Practical" && !theoryDelivery))) {
                      message.warning("Learner details required", "Complete your details and training component before continuing.");
                      return;
                    }
                    const sectionQuestions = visibleQuestions.filter((question) => question.section === visibleSections[step - 1] && question.required);
                    if (sectionQuestions.some((question) => !(answers[question.id]?.rating && answers[question.id].rating! >= question.scaleMin))) {
                      message.warning("Complete this section", "Answer all statements before continuing.");
                      return;
                    }
                    setStep((current) => current + 1);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  } : undefined}
                  disabled={submitting}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#102a43] px-5 text-sm font-bold text-white shadow-lg shadow-slate-300 transition hover:bg-[#173b5e] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-48"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {submitting ? "Submitting..." : modern && step < finalStep ? "Continue" : "Submit evaluation"}
                </button>
              </div>
            </div>
          </form>
        ) : null}

        <footer className="px-2 py-7 text-center text-xs leading-5 text-slate-500">
          Apollo Global Academy · Flight Management System
        </footer>
      </div>
    </main>
  );
}

function DynamicQuestion({
  question,
  index,
  answer,
  onChange,
}: {
  question: PublicEvaluationQuestion;
  index: number;
  answer?: PublicEvaluationAnswer;
  onChange: (update: Partial<PublicEvaluationAnswer>) => void;
}) {
  const ratings = Array.from(
    { length: Math.min(10, question.scaleMax - question.scaleMin + 1) },
    (_, offset) => question.scaleMin + offset
  );
  return (
    <fieldset className="rounded-lg border border-slate-200 p-4 sm:p-5">
      <legend className="sr-only">{question.text}</legend>
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-600">
          {String(index).padStart(2, "0")}
        </span>
        <p className="pt-0.5 text-sm font-semibold leading-6 text-slate-800">
          {question.text}
          {question.required ? <span className="ml-1 text-rose-600">*</span> : null}
        </p>
      </div>

      {question.responseType === "rating" ? <>
      <div className="mt-4 grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${ratings.length}, minmax(0, 1fr))` }}>
        {ratings.map((rating) => {
          const selected = answer?.rating === rating;
          return (
            <button
              key={rating}
              type="button"
              onClick={() => onChange({ rating })}
              className={`flex min-h-12 items-center justify-center rounded-lg border text-sm font-bold transition ${
                selected
                  ? "border-sky-700 bg-sky-700 text-white shadow-md"
                  : "border-slate-300 bg-white text-slate-600 hover:border-sky-400 hover:bg-sky-50"
              }`}
              aria-label={`${rating} rating`}
              aria-pressed={selected}
            >
              {rating}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] font-semibold text-slate-400 sm:text-xs">
        <span>{question.scaleMinLabel || "Lowest"}</span>
        <span>{question.scaleMaxLabel || "Highest"}</span>
      </div>
      </> : null}

      {question.responseType === "yesNo" ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {["yes", "no"].map((option) => {
            const selected = answer?.value === option;
            return <button key={option} type="button" onClick={() => onChange({ value: option })} aria-pressed={selected} className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border text-sm font-bold capitalize ${selected ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-sky-50"}`}>{selected ? <Check className="h-4 w-4" /> : null}{option}</button>;
          })}
        </div>
      ) : null}

      {question.responseType === "multipleChoice" ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {question.options.map((option) => {
            const selected = answer?.value === option;
            return <button key={option} type="button" onClick={() => onChange({ value: option })} aria-pressed={selected} className={`min-h-12 rounded-lg border px-3 text-left text-sm font-semibold ${selected ? "border-sky-700 bg-sky-50 text-sky-800 ring-2 ring-sky-100" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>{option}</button>;
          })}
        </div>
      ) : null}

      {question.responseType === "text" ? (
        <textarea value={answer?.value || ""} onChange={(event) => onChange({ value: event.target.value })} maxLength={2000} rows={4} className="mt-4 w-full rounded-lg border border-slate-300 bg-white p-3 text-base leading-6 text-slate-800 outline-none focus:border-sky-600 focus:ring-4 focus:ring-sky-100 sm:text-sm" placeholder="Enter your response" />
      ) : null}
    </fieldset>
  );
}

function SectionHeading({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-xs font-bold text-sky-700">{number}</span>
      <div>
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}

function SessionDetail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg bg-slate-50 p-3">
      <Icon className="h-4 w-4 shrink-0 text-sky-700" />
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase text-slate-400">
          {label}
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-slate-800">
          {value || "Not specified"}
        </p>
      </div>
    </div>
  );
}

function StatePanel({
  icon: Icon,
  iconClass,
  title,
  message,
  reference,
  action,
}: {
  icon: typeof AlertTriangle;
  iconClass: string;
  title: string;
  message: string;
  reference?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
      <div className="h-1 bg-sky-700" />
      <div className="flex min-h-72 flex-col items-center justify-center px-5 py-10 text-center sm:px-8">
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-lg ring-1 ${iconClass}`}
        >
          <Icon className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-950">{title}</h1>
        <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
          {message}
        </p>
        {reference ? (
          <p className="mt-5 rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
            Reference: {reference}
          </p>
        ) : null}
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-6 flex min-h-11 items-center gap-2 rounded-lg bg-[#102a43] px-5 text-sm font-bold text-white hover:bg-[#173b5e]"
          >
            <RefreshCw className="h-4 w-4" />
            {action.label}
          </button>
        ) : null}
      </div>
    </section>
  );
}
