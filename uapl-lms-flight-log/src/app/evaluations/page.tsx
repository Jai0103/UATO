"use client";

import QRCode from "qrcode";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  Loader2,
  MapPin,
  MessageSquareText,
  Plus,
  QrCode,
  Search,
  Star,
  UsersRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import {
  closeEvaluationSession,
  evaluationRatingFields,
  fetchEvaluationDashboard,
  fetchEvaluationResponsesPage,
  fetchEvaluationSessionsPage,
  saveEvaluationSession,
  type EvaluationDashboard,
  type EvaluationResponse,
  type EvaluationResponsesPage,
  type EvaluationSession,
  type EvaluationSessionInput,
  type EvaluationSessionStatus,
} from "@/lib/evaluations";

const inputClass =
  "mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-base text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-600 focus:ring-4 focus:ring-sky-100 sm:h-11 sm:text-sm";

const emptyDashboard: EvaluationDashboard = {
  totalSessions: 0,
  openSessions: 0,
  closedSessions: 0,
  totalResponses: 0,
  averageRating: 0,
};

const emptySessionsPage = {
  sessions: [] as EvaluationSession[],
  page: 1,
  pageSize: 10,
  totalRecords: 0,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
};

const questionLabels: Record<(typeof evaluationRatingFields)[number], string> =
  {
    objectivesClear: "Objectives were clear",
    materialsEffective: "Training materials",
    trainerKnowledge: "Trainer knowledge",
    theoryDelivery: "Theory delivery",
    practicalInstruction: "Practical instruction",
    equipmentFacilities: "Equipment and facilities",
    safetyGuidance: "Safety guidance",
    overallSatisfaction: "Overall satisfaction",
  };

function todayValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function emptyForm(): EvaluationSessionInput {
  return {
    id: "",
    courseName: "",
    trainerName: "",
    trainerEmail: "",
    trainingDate: todayValue(),
    location: "",
    status: "draft",
    opensAt: "",
    closesAt: "",
  };
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-SG", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-SG", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function toLocalDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIsoDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function statusStyle(status: EvaluationSessionStatus) {
  if (status === "open") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "closed") {
    return "border-slate-300 bg-slate-100 text-slate-600";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function evaluationUrl(token: string) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/UATO/evaluation/?token=${encodeURIComponent(
    token
  )}`;
}

export default function EvaluationsPage() {
  const message = useAppMessage();
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [sessionsPage, setSessionsPage] = useState(emptySessionsPage);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [working, setWorking] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<EvaluationSessionStatus | "">("");
  const [year, setYear] = useState("");
  const [form, setForm] = useState<EvaluationSessionInput | null>(null);
  const [qrSession, setQrSession] = useState<EvaluationSession | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [responsesSession, setResponsesSession] =
    useState<EvaluationSession | null>(null);
  const [responsesPage, setResponsesPage] =
    useState<EvaluationResponsesPage | null>(null);
  const [responseSearch, setResponseSearch] = useState("");
  const [responsesLoading, setResponsesLoading] = useState(false);

  const availableYears = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, index) => String(current - index));
  }, []);

  const loadSessions = useCallback(
    async (page = 1, quiet = false) => {
      if (!quiet) setTableLoading(true);
      try {
        const result = await fetchEvaluationSessionsPage({
          page,
          pageSize: 10,
          query: debouncedSearch,
          status,
          year,
        });
        setSessionsPage(result);
      } finally {
        if (!quiet) setTableLoading(false);
      }
    },
    [debouncedSearch, status, year]
  );

  const loadDashboard = useCallback(async () => {
    setDashboard(await fetchEvaluationDashboard());
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      300
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;

    async function initialize() {
      setLoading(true);
      try {
        const [nextDashboard, nextPage] = await Promise.all([
          fetchEvaluationDashboard(),
          fetchEvaluationSessionsPage({
            page: 1,
            pageSize: 10,
            query: debouncedSearch,
            status,
            year,
          }),
        ]);
        if (!active) return;
        setDashboard(nextDashboard);
        setSessionsPage(nextPage);
      } catch (error) {
        if (active) {
          message.error(
            "Unable to load evaluations",
            error instanceof Error ? error.message : "Please try again."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void initialize();
    return () => {
      active = false;
    };
  }, [debouncedSearch, message, status, year]);

  async function refreshAfterChange() {
    await Promise.all([loadDashboard(), loadSessions(sessionsPage.page, true)]);
  }

  function editSession(session: EvaluationSession) {
    setForm({
      id: session.id,
      courseName: session.courseName,
      trainerName: session.trainerName,
      trainerEmail: session.trainerEmail,
      trainingDate: session.trainingDate,
      location: session.location,
      status: session.status,
      opensAt: toLocalDateTime(session.opensAt),
      closesAt: toLocalDateTime(session.closesAt),
    });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || working) return;

    if (
      !form.courseName.trim() ||
      !form.trainerName.trim() ||
      !form.trainingDate ||
      !form.location.trim()
    ) {
      message.warning(
        "Complete required fields",
        "Course, trainer, training date, and location are required."
      );
      return;
    }

    setWorking("save");
    message.notify({
      type: "loading",
      title: form.id ? "Updating evaluation" : "Creating evaluation",
      message: "Saving the evaluation session securely.",
    });

    try {
      const saved = await saveEvaluationSession({
        ...form,
        courseName: form.courseName.trim(),
        trainerName: form.trainerName.trim(),
        trainerEmail: form.trainerEmail.trim(),
        location: form.location.trim(),
        opensAt: toIsoDateTime(form.opensAt),
        closesAt: toIsoDateTime(form.closesAt),
      });

      setForm(null);
      await refreshAfterChange();
      message.success(
        form.id ? "Evaluation updated" : "Evaluation created",
        saved.status === "open"
          ? "The student link is now accepting responses."
          : "The session was saved successfully."
      );
    } catch (error) {
      message.error(
        "Unable to save evaluation",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking("");
    }
  }

  async function handleClose(session: EvaluationSession) {
    const confirmed = await message.confirm({
      title: "Close evaluation session?",
      message:
        "Students will no longer be able to submit responses using this QR code.",
      confirmLabel: "Close session",
      cancelLabel: "Keep open",
      variant: "danger",
    });
    if (!confirmed) return;

    setWorking(`close:${session.id}`);
    message.notify({
      type: "loading",
      title: "Closing evaluation",
      message: "Updating the session status.",
    });

    try {
      await closeEvaluationSession(session.id);
      await refreshAfterChange();
      message.success(
        "Evaluation closed",
        "The QR link is no longer accepting responses."
      );
    } catch (error) {
      message.error(
        "Unable to close evaluation",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking("");
    }
  }

  async function showQr(session: EvaluationSession) {
    setQrSession(session);
    setQrDataUrl("");

    try {
      const dataUrl = await QRCode.toDataURL(evaluationUrl(session.token), {
        width: 960,
        margin: 3,
        errorCorrectionLevel: "H",
        color: {
          dark: "#102a43",
          light: "#ffffff",
        },
      });
      setQrDataUrl(dataUrl);
    } catch {
      setQrSession(null);
      message.error("Unable to create QR code", "Please try again.");
    }
  }

  async function copyStudentLink(session: EvaluationSession) {
    try {
      await navigator.clipboard.writeText(evaluationUrl(session.token));
      message.success(
        "Student link copied",
        "The evaluation link is ready to share."
      );
    } catch {
      message.error(
        "Unable to copy link",
        "Open the QR window and copy the displayed link manually."
      );
    }
  }

  function downloadQr() {
    if (!qrSession || !qrDataUrl) return;
    const safeCourse =
      qrSession.courseName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") ||
      "Training";
    const anchor = document.createElement("a");
    anchor.href = qrDataUrl;
    anchor.download = `${safeCourse}-Evaluation-QR.png`;
    anchor.click();
  }

  async function loadResponses(
    session: EvaluationSession,
    page = 1,
    query = responseSearch
  ) {
    setResponsesLoading(true);
    try {
      const result = await fetchEvaluationResponsesPage({
        sessionId: session.id,
        page,
        pageSize: 10,
        query: query.trim(),
      });
      setResponsesPage(result);
    } catch (error) {
      message.error(
        "Unable to load responses",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setResponsesLoading(false);
    }
  }

  async function showResponses(session: EvaluationSession) {
    setResponsesSession(session);
    setResponseSearch("");
    setResponsesPage(null);
    await loadResponses(session, 1, "");
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[55vh] items-center justify-center">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin text-sky-700" />
            <div>
              <p className="text-sm font-bold text-slate-950">
                Loading evaluations
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Retrieving sessions and responses...
              </p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <header className="rounded-lg border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-sky-700">
                Quality assurance
              </p>
              <h1 className="mt-1.5 text-2xl font-bold text-slate-950">
                Student Evaluations
              </h1>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Manage training feedback sessions and review student responses.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setForm(emptyForm())}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#102a43] px-4 text-sm font-bold text-white shadow-lg shadow-slate-200 transition hover:bg-[#173b5e]"
            >
              <Plus className="h-4 w-4" />
              New evaluation
            </button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Sessions"
            value={dashboard.totalSessions}
            icon={ClipboardList}
            tone="sky"
          />
          <MetricCard
            label="Open"
            value={dashboard.openSessions}
            icon={Clock3}
            tone="emerald"
          />
          <MetricCard
            label="Closed"
            value={dashboard.closedSessions}
            icon={CheckCircle2}
            tone="slate"
          />
          <MetricCard
            label="Responses"
            value={dashboard.totalResponses}
            icon={UsersRound}
            tone="violet"
          />
          <MetricCard
            label="Average"
            value={
              dashboard.averageRating
                ? `${dashboard.averageRating.toFixed(1)} / 5`
                : "-"
            }
            icon={Star}
            tone="amber"
          />
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_150px]">
              <label className="relative block">
                <span className="sr-only">Search evaluations</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-sky-600 focus:ring-4 focus:ring-sky-100"
                  placeholder="Search course, trainer, or location"
                />
              </label>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as EvaluationSessionStatus | "")
                }
                className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-sky-600 focus:ring-4 focus:ring-sky-100"
                aria-label="Filter by status"
              >
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
              <select
                value={year}
                onChange={(event) => setYear(event.target.value)}
                className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-sky-600 focus:ring-4 focus:ring-sky-100"
                aria-label="Filter by year"
              >
                <option value="">All years</option>
                {availableYears.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[950px]">
              <thead className="bg-slate-50 text-left">
                <tr className="border-b border-slate-200 text-xs font-bold uppercase text-slate-500">
                  <th className="px-5 py-3">Training</th>
                  <th className="px-4 py-3">Trainer</th>
                  <th className="px-4 py-3">Date / Location</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Responses</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessionsPage.sessions.map((session) => (
                  <tr
                    key={session.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                  >
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-900">
                        {session.courseName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Updated {formatDateTime(session.updatedAt)}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-semibold text-slate-800">
                        {session.trainerName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {session.trainerEmail || "No email"}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-semibold text-slate-800">
                        {formatDate(session.trainingDate)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {session.location}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={session.status} />
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => void showResponses(session)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-sky-700 hover:bg-sky-50"
                        title="View responses"
                      >
                        <MessageSquareText className="h-4 w-4" />
                        {session.responseCount}
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1.5">
                        <IconButton
                          label="View responses"
                          icon={Eye}
                          onClick={() => void showResponses(session)}
                        />
                        <IconButton
                          label="Show QR code"
                          icon={QrCode}
                          onClick={() => void showQr(session)}
                        />
                        <IconButton
                          label="Copy student link"
                          icon={Copy}
                          onClick={() => void copyStudentLink(session)}
                        />
                        <IconButton
                          label="Edit evaluation"
                          icon={Edit3}
                          onClick={() => editSession(session)}
                        />
                        {session.status === "open" ? (
                          <IconButton
                            label="Close evaluation"
                            icon={X}
                            danger
                            disabled={working === `close:${session.id}`}
                            onClick={() => void handleClose(session)}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-200 lg:hidden">
            {sessionsPage.sessions.map((session) => (
              <article key={session.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-bold text-slate-950">
                      {session.courseName}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {session.trainerName}
                    </p>
                  </div>
                  <StatusBadge status={session.status} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <MobileDetail
                    icon={CalendarDays}
                    value={formatDate(session.trainingDate)}
                  />
                  <MobileDetail icon={MapPin} value={session.location} />
                  <MobileDetail
                    icon={MessageSquareText}
                    value={`${session.responseCount} response${
                      session.responseCount === 1 ? "" : "s"
                    }`}
                  />
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2">
                  <IconButton
                    label="Responses"
                    icon={Eye}
                    onClick={() => void showResponses(session)}
                    mobile
                  />
                  <IconButton
                    label="QR code"
                    icon={QrCode}
                    onClick={() => void showQr(session)}
                    mobile
                  />
                  <IconButton
                    label="Copy link"
                    icon={Copy}
                    onClick={() => void copyStudentLink(session)}
                    mobile
                  />
                  <IconButton
                    label="Edit"
                    icon={Edit3}
                    onClick={() => editSession(session)}
                    mobile
                  />
                </div>
                {session.status === "open" ? (
                  <button
                    type="button"
                    onClick={() => void handleClose(session)}
                    className="mt-3 min-h-10 w-full rounded-lg border border-rose-200 bg-rose-50 text-sm font-bold text-rose-700"
                  >
                    Close session
                  </button>
                ) : null}
              </article>
            ))}
          </div>

          {!tableLoading && sessionsPage.sessions.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <ClipboardList className="mx-auto h-9 w-9 text-slate-300" />
              <p className="mt-3 font-bold text-slate-800">
                No evaluation sessions found
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Create a session or adjust the current filters.
              </p>
            </div>
          ) : null}

          <Pagination
            page={sessionsPage.page}
            totalPages={sessionsPage.totalPages}
            totalRecords={sessionsPage.totalRecords}
            disabled={tableLoading}
            onPage={(nextPage) => void loadSessions(nextPage)}
          />
        </section>
      </div>

      {form ? (
        <Modal
          title={form.id ? "Edit evaluation" : "New evaluation"}
          description="Configure the training details and response window."
          onClose={() => setForm(null)}
          maxWidth="max-w-3xl"
        >
          <form onSubmit={handleSave}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Course or programme" required wide>
                <input
                  value={form.courseName}
                  onChange={(event) =>
                    setForm({ ...form, courseName: event.target.value })
                  }
                  className={inputClass}
                  maxLength={160}
                  placeholder="Enter training programme"
                  autoFocus
                />
              </Field>
              <Field label="Trainer name" required>
                <input
                  value={form.trainerName}
                  onChange={(event) =>
                    setForm({ ...form, trainerName: event.target.value })
                  }
                  className={inputClass}
                  maxLength={120}
                  placeholder="Enter trainer name"
                />
              </Field>
              <Field label="Trainer email">
                <input
                  value={form.trainerEmail}
                  onChange={(event) =>
                    setForm({ ...form, trainerEmail: event.target.value })
                  }
                  className={inputClass}
                  maxLength={160}
                  type="email"
                  placeholder="trainer@example.com"
                />
              </Field>
              <Field label="Training date" required>
                <input
                  value={form.trainingDate}
                  onChange={(event) =>
                    setForm({ ...form, trainingDate: event.target.value })
                  }
                  className={inputClass}
                  type="date"
                />
              </Field>
              <Field label="Training location" required>
                <input
                  value={form.location}
                  onChange={(event) =>
                    setForm({ ...form, location: event.target.value })
                  }
                  className={inputClass}
                  maxLength={160}
                  placeholder="Enter training location"
                />
              </Field>
              <Field label="Status" required>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value as EvaluationSessionStatus,
                    })
                  }
                  className={inputClass}
                >
                  <option value="draft">Draft</option>
                  <option value="open">Open for responses</option>
                  <option value="closed">Closed</option>
                </select>
              </Field>
              <Field label="Opens at">
                <input
                  value={form.opensAt}
                  onChange={(event) =>
                    setForm({ ...form, opensAt: event.target.value })
                  }
                  className={inputClass}
                  type="datetime-local"
                />
              </Field>
              <Field label="Closes at">
                <input
                  value={form.closesAt}
                  onChange={(event) =>
                    setForm({ ...form, closesAt: event.target.value })
                  }
                  className={inputClass}
                  type="datetime-local"
                />
              </Field>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={working === "save"}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#102a43] px-5 text-sm font-bold text-white hover:bg-[#173b5e] disabled:opacity-60"
              >
                {working === "save" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {form.id ? "Save changes" : "Create evaluation"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {qrSession ? (
        <Modal
          title="Student evaluation QR"
          description={qrSession.courseName}
          onClose={() => setQrSession(null)}
          maxWidth="max-w-lg"
        >
          <div className="text-center">
            <div className="mx-auto flex aspect-square w-full max-w-[320px] items-center justify-center rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR code for ${qrSession.courseName}`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <Loader2 className="h-7 w-7 animate-spin text-sky-700" />
              )}
            </div>
            <p className="mt-4 text-sm font-bold text-slate-900">
              Scan to submit feedback
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {formatDate(qrSession.trainingDate)} · {qrSession.location}
            </p>
            <div className="mt-5 break-all rounded-lg bg-slate-100 p-3 text-left text-xs text-slate-600">
              {evaluationUrl(qrSession.token)}
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => void copyStudentLink(qrSession)}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <Copy className="h-4 w-4" />
                Copy link
              </button>
              <button
                type="button"
                onClick={downloadQr}
                disabled={!qrDataUrl}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Download
              </button>
              <a
                href={evaluationUrl(qrSession.token)}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#102a43] px-3 text-sm font-bold text-white hover:bg-[#173b5e]"
              >
                <ExternalLink className="h-4 w-4" />
                Open form
              </a>
            </div>
          </div>
        </Modal>
      ) : null}

      {responsesSession ? (
        <Modal
          title="Evaluation responses"
          description={responsesSession.courseName}
          onClose={() => {
            setResponsesSession(null);
            setResponsesPage(null);
          }}
          maxWidth="max-w-5xl"
        >
          {responsesLoading && !responsesPage ? (
            <div className="flex min-h-52 items-center justify-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-sky-700" />
              <span className="text-sm font-semibold text-slate-600">
                Loading responses...
              </span>
            </div>
          ) : null}

          {responsesPage ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryTile
                  label="Responses"
                  value={responsesPage.summary.responseCount}
                />
                <SummaryTile
                  label="Overall rating"
                  value={`${responsesPage.summary.averages.overallSatisfaction.toFixed(
                    1
                  )} / 5`}
                />
                <SummaryTile
                  label="Would recommend"
                  value={`${responsesPage.summary.recommendPercentage}%`}
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {evaluationRatingFields.map((field) => (
                  <div
                    key={field}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <p className="text-xs font-semibold text-slate-500">
                      {questionLabels[field]}
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-950">
                      {responsesPage.summary.averages[field].toFixed(1)}
                    </p>
                  </div>
                ))}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void loadResponses(responsesSession, 1, responseSearch);
                }}
                className="flex gap-2"
              >
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={responseSearch}
                    onChange={(event) => setResponseSearch(event.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-sky-600 focus:ring-4 focus:ring-sky-100"
                    placeholder="Search names, organisations, or comments"
                  />
                </div>
                <button
                  type="submit"
                  className="min-h-11 rounded-lg bg-[#102a43] px-4 text-sm font-bold text-white"
                >
                  Search
                </button>
              </form>

              <div className="space-y-3">
                {responsesPage.responses.map((response) => (
                  <ResponseCard key={response.id} response={response} />
                ))}
                {!responsesPage.responses.length ? (
                  <div className="rounded-lg border border-dashed border-slate-300 px-5 py-10 text-center">
                    <MessageSquareText className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-3 font-bold text-slate-800">
                      No responses found
                    </p>
                  </div>
                ) : null}
              </div>

              <Pagination
                page={responsesPage.page}
                totalPages={responsesPage.totalPages}
                totalRecords={responsesPage.totalRecords}
                disabled={responsesLoading}
                onPage={(nextPage) =>
                  void loadResponses(
                    responsesSession,
                    nextPage,
                    responseSearch
                  )
                }
              />
            </div>
          ) : null}
        </Modal>
      ) : null}

      {tableLoading ? (
        <LoadingOverlay
          label="Loading evaluations"
          description="Applying the selected filters."
        />
      ) : null}
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof ClipboardList;
  tone: "sky" | "emerald" | "slate" | "violet" | "amber";
}) {
  const tones = {
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    slate: "border-slate-200 bg-slate-100 text-slate-600",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  };

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg border ${tones[tone]}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: EvaluationSessionStatus }) {
  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-bold capitalize ${statusStyle(
        status
      )}`}
    >
      {status}
    </span>
  );
}

function IconButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  danger = false,
  mobile = false,
}: {
  label: string;
  icon: typeof Eye;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  mobile?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex min-h-10 items-center justify-center rounded-lg border transition disabled:opacity-50 ${
        mobile ? "flex-col gap-1 px-2 py-2 text-[10px] font-bold" : "w-10"
      } ${
        danger
          ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
          : "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {mobile ? <span>{label}</span> : null}
    </button>
  );
}

function MobileDetail({
  icon: Icon,
  value,
}: {
  icon: typeof CalendarDays;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-slate-600">
      <Icon className="h-3.5 w-3.5 shrink-0 text-sky-700" />
      <span className="truncate font-semibold">{value}</span>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  totalRecords,
  disabled,
  onPage,
}: {
  page: number;
  totalPages: number;
  totalRecords: number;
  disabled: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="text-xs font-semibold text-slate-500">
        {totalRecords} record{totalRecords === 1 ? "" : "s"} · Page {page} of{" "}
        {totalPages}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={disabled || page <= 1}
          className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={disabled || page >= totalPages}
          className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  required = false,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="text-sm font-bold text-slate-700">
        {label}
        {required ? <span className="ml-1 text-rose-600">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function Modal({
  title,
  description,
  onClose,
  maxWidth,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  maxWidth: string;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <section
        className={`max-h-[94dvh] w-full overflow-hidden rounded-t-lg border border-white/40 bg-white shadow-2xl sm:rounded-lg ${maxWidth}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            aria-label="Close"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="max-h-[calc(94dvh-85px)] overflow-y-auto p-5 sm:p-6">
          {children}
        </div>
      </section>
    </div>
  );
}

function SummaryTile({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
      <p className="text-xs font-bold uppercase text-sky-700">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function ResponseCard({ response }: { response: EvaluationResponse }) {
  const ratingAverage =
    evaluationRatingFields.reduce(
      (total, field) => total + response[field],
      0
    ) / evaluationRatingFields.length;

  return (
    <article className="rounded-lg border border-slate-200 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-bold text-slate-950">
            {response.studentName || "Anonymous student"}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {response.company || "Organisation not provided"} ·{" "}
            {formatDateTime(response.submittedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
            {ratingAverage.toFixed(1)} / 5
          </span>
          <span
            className={`rounded-md border px-2.5 py-1 text-xs font-bold ${
              response.recommendTraining === "yes"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-100 text-slate-600"
            }`}
          >
            Recommend: {response.recommendTraining === "yes" ? "Yes" : "No"}
          </span>
        </div>
      </div>

      {response.mostUseful ||
      response.improvements ||
      response.additionalComments ? (
        <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 lg:grid-cols-3">
          <CommentBlock label="Most useful" value={response.mostUseful} />
          <CommentBlock label="Improvements" value={response.improvements} />
          <CommentBlock
            label="Additional comments"
            value={response.additionalComments}
          />
        </div>
      ) : null}
    </article>
  );
}

function CommentBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-[11px] font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-5 text-slate-700">
        {value || "No comment"}
      </p>
    </div>
  );
}
