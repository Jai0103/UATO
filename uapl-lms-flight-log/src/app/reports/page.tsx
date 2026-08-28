"use client";

import {
  CalendarRange,
  Check,
  Download,
  FileSpreadsheet,
  GraduationCap,
  ListFilter,
  Loader2,
  MessageSquareText,
  Plane,
  Search,
  ShieldCheck,
  Wrench,
  X
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { useAppMessage } from "@/components/message-provider";
import { getSecureSession } from "@/lib/auth-api";
import {
  fetchBulkFlightReportRecords,
  fetchBulkFatigueRiskReportRecords,
  fetchBulkStaffTrainingReportRecords,
  fetchBulkUaMaintenanceReportRecords,
  fetchFatigueRiskReportTrainerNames
} from "@/lib/bulk-report-api";
import {
  fetchAllEvaluationResponses,
  fetchEvaluationSessionsPage,
  type EvaluationSession
} from "@/lib/evaluations";
import {
  downloadEvaluationCsv,
  downloadEvaluationPdf
} from "@/lib/evaluation-report";
import type { UaMaintenanceRecord } from "@/lib/ua-maintenance";

type MaintenanceUaOption = {
  key: string;
  uaModel: string;
  uaId: string;
  recordCount: number;
};

type ReportType =
  | "flight"
  | "staff"
  | "maintenance"
  | "fatigue"
  | "evaluation-pdf"
  | "evaluation-csv";

const fieldClass =
  "mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-100 md:h-11 md:text-sm";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonth() {
  return `${today().slice(0, 7)}-01`;
}

function currentMonth() {
  return today().slice(0, 7);
}

function validateRange(start: string, end: string, label: string) {
  if (!start || !end) return `Select the complete ${label}.`;
  if (start > end) return `${label} start cannot be after its end.`;
  return "";
}

function allowBrowserPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function maintenanceUaKey(record: Pick<UaMaintenanceRecord, "uaModel" | "uaId">) {
  return JSON.stringify([
    String(record.uaModel || "").trim().toLowerCase(),
    String(record.uaId || "").trim().toLowerCase()
  ]);
}

export default function ReportsPage() {
  const message = useAppMessage();
  const session = getSecureSession();
  const isAdmin = session?.role === "admin";
  const [working, setWorking] = useState<ReportType | null>(null);
  const [workingLabel, setWorkingLabel] = useState("");
  const [flightFrom, setFlightFrom] = useState(firstDayOfMonth());
  const [flightTo, setFlightTo] = useState(today());
  const [staffName, setStaffName] = useState("");
  const [staffMonthFrom, setStaffMonthFrom] = useState(currentMonth());
  const [staffMonthTo, setStaffMonthTo] = useState(currentMonth());
  const [maintenanceFrom, setMaintenanceFrom] = useState(firstDayOfMonth());
  const [maintenanceTo, setMaintenanceTo] = useState(today());
  const [maintenancePickerOpen, setMaintenancePickerOpen] = useState(false);
  const [maintenancePickerLoading, setMaintenancePickerLoading] = useState(false);
  const [maintenanceSearch, setMaintenanceSearch] = useState("");
  const [maintenanceOptions, setMaintenanceOptions] = useState<
    MaintenanceUaOption[]
  >([]);
  const [selectedMaintenanceUaKeys, setSelectedMaintenanceUaKeys] = useState<
    string[]
  >([]);
  const [maintenanceSelectionApplied, setMaintenanceSelectionApplied] =
    useState(false);
  const [maintenanceRecordsCache, setMaintenanceRecordsCache] = useState<{
    rangeKey: string;
    records: UaMaintenanceRecord[];
  } | null>(null);
  const [fatigueFrom, setFatigueFrom] = useState(firstDayOfMonth());
  const [fatigueTo, setFatigueTo] = useState(today());
  const [fatigueTrainerName, setFatigueTrainerName] = useState("");
  const [fatigueTrainerNames, setFatigueTrainerNames] = useState<string[]>([]);
  const [fatigueTrainersLoading, setFatigueTrainersLoading] = useState(false);
  const [fatigueTrainersError, setFatigueTrainersError] = useState("");
  const [evaluationSearch, setEvaluationSearch] = useState("");
  const [evaluationYear, setEvaluationYear] = useState("");
  const [evaluationSessions, setEvaluationSessions] = useState<
    EvaluationSession[]
  >([]);
  const [selectedEvaluationId, setSelectedEvaluationId] = useState("");
  const [evaluationSessionsLoading, setEvaluationSessionsLoading] =
    useState(false);
  const [evaluationLoadError, setEvaluationLoadError] = useState("");

  const evaluationYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from(
      { length: 8 },
      (_, index) => String(currentYear - index)
    );
  }, []);

  const filteredMaintenanceOptions = useMemo(() => {
    const query = maintenanceSearch.trim().toLowerCase();
    if (!query) return maintenanceOptions;

    return maintenanceOptions.filter((option) =>
      `${option.uaModel} ${option.uaId}`.toLowerCase().includes(query)
    );
  }, [maintenanceOptions, maintenanceSearch]);

  const maintenanceSelectionLabel = useMemo(() => {
    if (!maintenanceSelectionApplied) return "All UA in date range";
    if (!maintenanceOptions.length) return "No UA available";
    if (selectedMaintenanceUaKeys.length === maintenanceOptions.length) {
      return `All ${maintenanceOptions.length} UA selected`;
    }
    return `${selectedMaintenanceUaKeys.length} of ${maintenanceOptions.length} UA selected`;
  }, [
    maintenanceOptions.length,
    maintenanceSelectionApplied,
    selectedMaintenanceUaKeys.length
  ]);

  useEffect(() => {
    setMaintenancePickerOpen(false);
    setMaintenanceSearch("");
    setMaintenanceOptions([]);
    setSelectedMaintenanceUaKeys([]);
    setMaintenanceSelectionApplied(false);
    setMaintenanceRecordsCache(null);
  }, [maintenanceFrom, maintenanceTo]);

  useEffect(() => {
    if (!isAdmin) return;

    let active = true;
    const timer = window.setTimeout(async () => {
      setEvaluationSessionsLoading(true);
      setEvaluationLoadError("");

      try {
        const result = await fetchEvaluationSessionsPage({
          page: 1,
          pageSize: 25,
          query: evaluationSearch.trim(),
          status: "",
          year: evaluationYear
        });
        if (!active) return;

        setEvaluationSessions(result.sessions);
        setSelectedEvaluationId((current) => {
          if (result.sessions.some((session) => session.id === current)) {
            return current;
          }
          return result.sessions[0]?.id || "";
        });
      } catch (error) {
        if (!active) return;
        setEvaluationSessions([]);
        setSelectedEvaluationId("");
        setEvaluationLoadError(
          error instanceof Error
            ? error.message
            : "Evaluation sessions could not be loaded."
        );
      } finally {
        if (active) setEvaluationSessionsLoading(false);
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [evaluationSearch, evaluationYear, isAdmin]);

  useEffect(() => {
    if (!isAdmin || !fatigueFrom || !fatigueTo || fatigueFrom > fatigueTo) {
      setFatigueTrainerNames([]);
      setFatigueTrainerName("");
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setFatigueTrainersLoading(true);
      setFatigueTrainersError("");

      try {
        const names = await fetchFatigueRiskReportTrainerNames({
          dateFrom: fatigueFrom,
          dateTo: fatigueTo
        });
        if (!active) return;

        setFatigueTrainerNames(names);
        setFatigueTrainerName((current) =>
          !current || names.includes(current) ? current : ""
        );
      } catch (error) {
        if (!active) return;
        setFatigueTrainerNames([]);
        setFatigueTrainerName("");
        setFatigueTrainersError(
          error instanceof Error
            ? error.message
            : "Trainer names could not be loaded."
        );
      } finally {
        if (active) setFatigueTrainersLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [fatigueFrom, fatigueTo, isAdmin]);

  async function generateFlightReport() {
    if (working) return;
    const validation = validateRange(flightFrom, flightTo, "flight date range");
    if (validation) {
      message.warning("Select a valid date range", validation);
      return;
    }
    setWorking("flight");
    setWorkingLabel("Loading Flight Log records...");
    try {
      const [records, pdfModule] = await Promise.all([
        fetchBulkFlightReportRecords({
          dateFrom: flightFrom,
          dateTo: flightTo
        }),
        import("@/lib/pdf")
      ]);
      if (!records.length) {
        message.warning("No Flight Logs found", "Try a different date range.");
        return;
      }

      setWorkingLabel(`Building ${records.length} Flight Log report(s)...`);
      await allowBrowserPaint();
      await pdfModule.preloadFlightLogPdfAssets();
      const doc = pdfModule.createCombinedFlightLogPdf(records);

      setWorkingLabel("Starting PDF download...");
      await allowBrowserPaint();
      doc.save(`FLIGHT LOGS - ${flightFrom} TO ${flightTo}.pdf`);
      message.success(`${records.length} Flight Log report(s) combined`);
    } catch (error) {
      message.error(
        "Combined Flight Log could not be generated",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking(null);
      setWorkingLabel("");
    }
  }

  async function generateStaffReport() {
    if (working) return;
    const validation = validateRange(
      staffMonthFrom,
      staffMonthTo,
      "Staff Training month range"
    );
    if (validation) {
      message.warning("Select a valid month range", validation);
      return;
    }
    setWorking("staff");
    setWorkingLabel("Loading Staff Training records...");
    try {
      const [records, pdfModule] = await Promise.all([
        fetchBulkStaffTrainingReportRecords({
          staffName: staffName.trim(),
          monthFrom: staffMonthFrom,
          monthTo: staffMonthTo
        }),
        import("@/lib/staff-training-pdf")
      ]);
      if (!records.length) {
        message.warning(
          "No Staff Training records found",
          "Try another staff name or month range."
        );
        return;
      }

      setWorkingLabel(`Building ${records.length} Staff Training report(s)...`);
      await allowBrowserPaint();
      const doc = await pdfModule.createCombinedStaffTrainingPdf(records);

      setWorkingLabel("Starting PDF download...");
      await allowBrowserPaint();
      doc.save(
        `STAFF TRAINING - ${staffMonthFrom} TO ${staffMonthTo}.pdf`
      );
      message.success(`${records.length} Staff Training report(s) combined`);
    } catch (error) {
      message.error(
        "Combined Staff Training report could not be generated",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking(null);
      setWorkingLabel("");
    }
  }

  function buildMaintenanceOptions(records: UaMaintenanceRecord[]) {
    const grouped = new Map<string, MaintenanceUaOption>();

    records.forEach((record) => {
      const key = maintenanceUaKey(record);
      const existing = grouped.get(key);
      if (existing) {
        existing.recordCount += 1;
        return;
      }

      grouped.set(key, {
        key,
        uaModel: record.uaModel || "Unspecified model",
        uaId: record.uaId || "No UA ID",
        recordCount: 1
      });
    });

    return Array.from(grouped.values()).sort((first, second) =>
      `${first.uaModel} ${first.uaId}`.localeCompare(
        `${second.uaModel} ${second.uaId}`,
        undefined,
        { numeric: true, sensitivity: "base" }
      )
    );
  }

  async function openMaintenancePicker() {
    if (working || maintenancePickerLoading) return;

    const validation = validateRange(
      maintenanceFrom,
      maintenanceTo,
      "UA Maintenance date range"
    );
    if (validation) {
      message.warning("Select a valid date range", validation);
      return;
    }

    setMaintenancePickerOpen(true);
    setMaintenancePickerLoading(true);
    setMaintenanceSearch("");

    try {
      const rangeKey = `${maintenanceFrom}:${maintenanceTo}`;
      const records =
        maintenanceRecordsCache?.rangeKey === rangeKey
          ? maintenanceRecordsCache.records
          : await fetchBulkUaMaintenanceReportRecords({
              dateFrom: maintenanceFrom,
              dateTo: maintenanceTo
            });

      setMaintenanceRecordsCache({ rangeKey, records });
      const options = buildMaintenanceOptions(records);
      setMaintenanceOptions(options);
      setSelectedMaintenanceUaKeys((current) => {
        if (!maintenanceSelectionApplied) {
          return options.map((option) => option.key);
        }

        const availableKeys = new Set(options.map((option) => option.key));
        return current.filter((key) => availableKeys.has(key));
      });
    } catch (error) {
      setMaintenancePickerOpen(false);
      message.error(
        "UA list could not be loaded",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setMaintenancePickerLoading(false);
    }
  }

  function toggleMaintenanceUa(key: string) {
    setSelectedMaintenanceUaKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
  }

  function applyMaintenanceSelection() {
    if (!selectedMaintenanceUaKeys.length) {
      message.warning(
        "Select at least one UA",
        "Tick the aircraft that should be included in the report."
      );
      return;
    }

    setMaintenanceSelectionApplied(true);
    setMaintenancePickerOpen(false);
    message.success(
      "UA selection applied",
      `${selectedMaintenanceUaKeys.length} UA will be included.`
    );
  }

  async function generateMaintenanceReport() {
    if (working) return;
    const validation = validateRange(
      maintenanceFrom,
      maintenanceTo,
      "UA Maintenance date range"
    );
    if (validation) {
      message.warning("Select a valid date range", validation);
      return;
    }
    setWorking("maintenance");
    setWorkingLabel("Loading UA Maintenance records...");
    try {
      const rangeKey = `${maintenanceFrom}:${maintenanceTo}`;
      const [allRecords, pdfModule] = await Promise.all([
        maintenanceRecordsCache?.rangeKey === rangeKey
          ? Promise.resolve(maintenanceRecordsCache.records)
          : fetchBulkUaMaintenanceReportRecords({
              dateFrom: maintenanceFrom,
              dateTo: maintenanceTo
            }),
        import("@/lib/ua-maintenance-pdf")
      ]);
      setMaintenanceRecordsCache({ rangeKey, records: allRecords });

      const selectedKeys = new Set(selectedMaintenanceUaKeys);
      const records = maintenanceSelectionApplied
        ? allRecords.filter((record) =>
            selectedKeys.has(maintenanceUaKey(record))
          )
        : allRecords;

      if (!records.length) {
        message.warning(
          "No UA Maintenance records found",
          maintenanceSelectionApplied
            ? "No records match the selected UA and date range."
            : "Try a different date range."
        );
        return;
      }

      setWorkingLabel(`Building ${records.length} UA Maintenance report(s)...`);
      await allowBrowserPaint();
      const doc = await pdfModule.createCombinedUaMaintenancePdf(records);

      setWorkingLabel("Starting PDF download...");
      await allowBrowserPaint();
      doc.save(
        `UA MAINTENANCE - ${maintenanceFrom} TO ${maintenanceTo}.pdf`
      );
      message.success(`${records.length} UA Maintenance report(s) combined`);
    } catch (error) {
      message.error(
        "Combined UA Maintenance report could not be generated",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking(null);
      setWorkingLabel("");
    }
  }

  async function generateEvaluationReport(format: "pdf" | "csv") {
    if (working) return;
    const selectedSession = evaluationSessions.find(
      (evaluation) => evaluation.id === selectedEvaluationId
    );

    if (!selectedSession) {
      message.warning(
        "Select an evaluation session",
        "Search for and select the training evaluation to export."
      );
      return;
    }

    const workType =
      format === "pdf" ? "evaluation-pdf" : "evaluation-csv";
    setWorking(workType);
    setWorkingLabel("Loading all evaluation responses...");

    try {
      const complete = await fetchAllEvaluationResponses(selectedSession.id);

      if (!complete.responses.length) {
        message.warning(
          "No evaluation responses found",
          "The selected session does not have any submitted responses."
        );
        return;
      }

      setWorkingLabel(
        format === "pdf"
          ? "Building evaluation PDF..."
          : "Preparing evaluation CSV..."
      );
      await allowBrowserPaint();

      if (format === "pdf") {
        await downloadEvaluationPdf(
          selectedSession,
          complete.responses,
          complete.summary
        );
      } else {
        downloadEvaluationCsv(selectedSession, complete.responses);
      }

      message.success(
        format === "pdf"
          ? "Evaluation PDF downloaded"
          : "Evaluation CSV downloaded",
        `${complete.responses.length} response${
          complete.responses.length === 1 ? "" : "s"
        } included.`
      );
    } catch (error) {
      message.error(
        "Evaluation report could not be generated",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking(null);
      setWorkingLabel("");
    }
  }

  async function generateFatigueRiskReport() {
    if (working) return;
    const validation = validateRange(
      fatigueFrom,
      fatigueTo,
      "Fatigue Risk date range"
    );
    if (validation) {
      message.warning("Select a valid date range", validation);
      return;
    }

    setWorking("fatigue");
    setWorkingLabel("Loading Fatigue Risk checklists...");
    try {
      const [records, pdfModule] = await Promise.all([
        fetchBulkFatigueRiskReportRecords({
          dateFrom: fatigueFrom,
          dateTo: fatigueTo,
          trainerName: fatigueTrainerName.trim()
        }),
        import("@/lib/fatigue-risk-pdf")
      ]);

      if (!records.length) {
        message.warning(
          "No Fatigue Risk checklists found",
          "Try another trainer name or date range."
        );
        return;
      }

      setWorkingLabel(
        `Building ${records.length} Fatigue Risk checklist(s)...`
      );
      await allowBrowserPaint();
      const doc = await pdfModule.createCombinedFatigueRiskPdf(records);

      setWorkingLabel("Starting PDF download...");
      await allowBrowserPaint();
      doc.save(`FATIGUE RISK - ${fatigueFrom} TO ${fatigueTo}.pdf`);
      message.success(
        `${records.length} Fatigue Risk checklist(s) combined`
      );
    } catch (error) {
      message.error(
        "Combined Fatigue Risk report could not be generated",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking(null);
      setWorkingLabel("");
    }
  }

  return (
    <AppShell>
      <div className="app-page">
        <header className="rounded-lg border border-slate-200 border-t-4 border-t-sky-600 bg-white p-4 shadow-sm sm:p-5">
          <div className="inline-flex items-center gap-2 rounded-md bg-sky-50 px-2.5 py-1 text-xs font-bold uppercase text-sky-700 ring-1 ring-sky-100">
            <CalendarRange className="h-4 w-4" /> Report Centre
          </div>
          <h1 className="mt-3 text-2xl font-bold text-slate-800 sm:text-3xl">
            Combined Reports
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Generate operational report batches for the selected reporting period.
          </p>
        </header>

        <div
          className={`grid gap-5 ${
            isAdmin ? "xl:grid-cols-2 2xl:grid-cols-3" : "max-w-2xl"
          }`}
        >
          <ReportCard
            icon={<Plane className="h-5 w-5" />}
            title="Flight Logs"
            description="Combined student Flight Logs"
            accent="sky"
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Field label="Date from">
                <input
                  type="date"
                  className={fieldClass}
                  value={flightFrom}
                  max={flightTo || today()}
                  onChange={(event) => setFlightFrom(event.target.value)}
                />
              </Field>
              <Field label="Date to">
                <input
                  type="date"
                  className={fieldClass}
                  value={flightTo}
                  min={flightFrom}
                  max={today()}
                  onChange={(event) => setFlightTo(event.target.value)}
                />
              </Field>
            </div>
            <GenerateButton
              accent="sky"
              busy={working === "flight"}
              busyLabel={workingLabel}
              disabled={working !== null}
              label="Download combined PDF"
              onClick={() => void generateFlightReport()}
            />
          </ReportCard>

          {isAdmin ? (
            <ReportCard
              icon={<GraduationCap className="h-5 w-5" />}
              title="Staff Training"
              description="Combined Staff Internal Training records"
              accent="emerald"
            >
              <Field label="Staff name">
                <div className="relative">
                  <Search className="absolute left-3 top-[26px] h-4 w-4 text-slate-400" />
                  <input
                    className={`${fieldClass} pl-10`}
                    value={staffName}
                    onChange={(event) => setStaffName(event.target.value)}
                    placeholder="All staff or search by name"
                  />
                </div>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <Field label="Month from">
                  <input
                    type="month"
                    className={fieldClass}
                    value={staffMonthFrom}
                    max={staffMonthTo || currentMonth()}
                    onChange={(event) => setStaffMonthFrom(event.target.value)}
                  />
                </Field>
                <Field label="Month to">
                  <input
                    type="month"
                    className={fieldClass}
                    value={staffMonthTo}
                    min={staffMonthFrom}
                    max={currentMonth()}
                    onChange={(event) => setStaffMonthTo(event.target.value)}
                  />
                </Field>
              </div>
              <GenerateButton
                accent="emerald"
                busy={working === "staff"}
                busyLabel={workingLabel}
                disabled={working !== null}
                label="Download combined PDF"
                onClick={() => void generateStaffReport()}
              />
            </ReportCard>
          ) : null}

          {isAdmin ? (
            <ReportCard
              icon={<Wrench className="h-5 w-5" />}
              title="UA Maintenance"
              description="Combined Routine UA Maintenance checks"
              accent="amber"
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <Field label="Date from">
                  <input
                    type="date"
                    className={fieldClass}
                    value={maintenanceFrom}
                    max={maintenanceTo || today()}
                    onChange={(event) => setMaintenanceFrom(event.target.value)}
                  />
                </Field>
                <Field label="Date to">
                  <input
                    type="date"
                    className={fieldClass}
                    value={maintenanceTo}
                    min={maintenanceFrom}
                    max={today()}
                    onChange={(event) => setMaintenanceTo(event.target.value)}
                  />
                </Field>
              </div>
              <button
                type="button"
                onClick={() => void openMaintenancePicker()}
                disabled={working !== null || maintenancePickerLoading}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left transition hover:border-amber-400 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {maintenancePickerLoading ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-amber-700" />
                ) : (
                  <ListFilter className="h-5 w-5 shrink-0 text-amber-700" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-800">
                    Select UA
                  </span>
                  <span className="block truncate text-xs text-slate-600">
                    {maintenancePickerLoading
                      ? "Loading aircraft in this date range..."
                      : maintenanceSelectionLabel}
                  </span>
                </span>
              </button>
              <GenerateButton
                accent="amber"
                busy={working === "maintenance"}
                busyLabel={workingLabel}
                disabled={working !== null}
                label="Download combined PDF"
                onClick={() => void generateMaintenanceReport()}
              />
            </ReportCard>
          ) : null}

          {isAdmin ? (
            <ReportCard
              icon={<MessageSquareText className="h-5 w-5" />}
              title="Student Evaluations"
              description="Training feedback summary and response data"
              accent="violet"
            >
              <Field label="Search training or trainer">
                <div className="relative">
                  <Search className="absolute left-3 top-[26px] h-4 w-4 text-slate-400" />
                  <input
                    className={`${fieldClass} pl-10`}
                    value={evaluationSearch}
                    onChange={(event) =>
                      setEvaluationSearch(event.target.value)
                    }
                    placeholder="Search evaluation sessions"
                  />
                </div>
              </Field>

              <Field label="Training year">
                <select
                  className={fieldClass}
                  value={evaluationYear}
                  onChange={(event) =>
                    setEvaluationYear(event.target.value)
                  }
                >
                  <option value="">All years</option>
                  {evaluationYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Evaluation session">
                <select
                  className={fieldClass}
                  value={selectedEvaluationId}
                  onChange={(event) =>
                    setSelectedEvaluationId(event.target.value)
                  }
                  disabled={evaluationSessionsLoading}
                >
                  {evaluationSessionsLoading ? (
                    <option value="">Loading sessions...</option>
                  ) : null}
                  {!evaluationSessionsLoading &&
                  !evaluationSessions.length ? (
                    <option value="">No sessions found</option>
                  ) : null}
                  {evaluationSessions.map((evaluation) => (
                    <option key={evaluation.id} value={evaluation.id}>
                      {evaluation.trainingDate} - {evaluation.courseName} -{" "}
                      {evaluation.responseCount} response
                      {evaluation.responseCount === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </Field>

              {evaluationLoadError ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
                  {evaluationLoadError}
                </p>
              ) : null}

              <div className="mt-auto grid grid-cols-2 gap-2">
                <GenerateButton
                  accent="violet"
                  busy={working === "evaluation-pdf"}
                  busyLabel={workingLabel}
                  disabled={
                    working !== null ||
                    evaluationSessionsLoading ||
                    !selectedEvaluationId
                  }
                  label="PDF report"
                  onClick={() => void generateEvaluationReport("pdf")}
                />
                <button
                  type="button"
                  onClick={() => void generateEvaluationReport("csv")}
                  disabled={
                    working !== null ||
                    evaluationSessionsLoading ||
                    !selectedEvaluationId
                  }
                  className="mt-auto inline-flex h-12 w-full min-w-0 items-center justify-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 text-sm font-bold text-violet-700 shadow-sm transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {working === "evaluation-csv" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4" />
                  )}
                  <span className="truncate">
                    {working === "evaluation-csv"
                      ? workingLabel || "Preparing CSV..."
                      : "CSV data"}
                  </span>
                </button>
              </div>
            </ReportCard>
          ) : null}

          {isAdmin ? (
            <ReportCard
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Fatigue Risk Identification"
              description="Combined weekly Fatigue Risk checklists"
              accent="rose"
            >
              <Field label="Trainer name">
                <select
                  className={fieldClass}
                  value={fatigueTrainerName}
                  onChange={(event) =>
                    setFatigueTrainerName(event.target.value)
                  }
                  disabled={fatigueTrainersLoading}
                >
                  <option value="">
                    {fatigueTrainersLoading
                      ? "Loading trainers..."
                      : "All trainers"}
                  </option>
                  {fatigueTrainerNames.map((trainerName) => (
                    <option key={trainerName} value={trainerName}>
                      {trainerName}
                    </option>
                  ))}
                </select>
              </Field>

              {fatigueTrainersError ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
                  {fatigueTrainersError}
                </p>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <Field label="Date from">
                  <input
                    type="date"
                    className={fieldClass}
                    value={fatigueFrom}
                    max={fatigueTo || today()}
                    onChange={(event) => setFatigueFrom(event.target.value)}
                  />
                </Field>
                <Field label="Date to">
                  <input
                    type="date"
                    className={fieldClass}
                    value={fatigueTo}
                    min={fatigueFrom}
                    max={today()}
                    onChange={(event) => setFatigueTo(event.target.value)}
                  />
                </Field>
              </div>

              <GenerateButton
                accent="rose"
                busy={working === "fatigue"}
                busyLabel={workingLabel}
                disabled={working !== null || fatigueTrainersLoading}
                label="Download combined PDF"
                onClick={() => void generateFatigueRiskReport()}
              />
            </ReportCard>
          ) : null}
        </div>
      </div>

      {maintenancePickerOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !maintenancePickerLoading) {
              setMaintenancePickerOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="maintenance-ua-picker-title"
            className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-2xl sm:max-w-2xl sm:rounded-xl"
          >
            <header className="flex items-start gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <Wrench className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="maintenance-ua-picker-title"
                  className="text-lg font-bold text-slate-900"
                >
                  Select UA for report
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Showing aircraft with maintenance records from {maintenanceFrom} to {maintenanceTo}.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close UA selector"
                onClick={() => setMaintenancePickerOpen(false)}
                disabled={maintenancePickerLoading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={maintenanceSearch}
                  onChange={(event) => setMaintenanceSearch(event.target.value)}
                  placeholder="Search UA model or UA ID"
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-base text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 sm:text-sm"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold text-slate-500">
                  {selectedMaintenanceUaKeys.length} of {maintenanceOptions.length} selected
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedMaintenanceUaKeys(
                        maintenanceOptions.map((option) => option.key)
                      )
                    }
                    className="text-xs font-bold text-amber-700 hover:text-amber-800"
                  >
                    Select all
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedMaintenanceUaKeys([])}
                    className="text-xs font-bold text-slate-600 hover:text-slate-900"
                  >
                    Clear all
                  </button>
                </div>
              </div>
            </div>

            <div className="min-h-48 flex-1 overflow-y-auto px-3 py-3 sm:px-5">
              {maintenancePickerLoading ? (
                <div className="flex min-h-48 flex-col items-center justify-center text-center">
                  <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
                  <p className="mt-3 text-sm font-semibold text-slate-700">
                    Loading UA records...
                  </p>
                </div>
              ) : null}

              {!maintenancePickerLoading && !filteredMaintenanceOptions.length ? (
                <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center">
                  <Wrench className="h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-bold text-slate-700">
                    No UA records found
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Try another search or close this window and change the date range.
                  </p>
                </div>
              ) : null}

              {!maintenancePickerLoading ? (
                <div className="divide-y divide-slate-100">
                  {filteredMaintenanceOptions.map((option) => {
                    const checked = selectedMaintenanceUaKeys.includes(option.key);
                    return (
                      <label
                        key={option.key}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-3 transition hover:bg-amber-50 sm:px-3"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMaintenanceUa(option.key)}
                          className="sr-only"
                        />
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition ${
                            checked
                              ? "border-amber-600 bg-amber-600 text-white"
                              : "border-slate-300 bg-white text-transparent"
                          }`}
                        >
                          <Check className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-slate-800">
                            {option.uaModel}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            UA ID: {option.uaId}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                          {option.recordCount} {option.recordCount === 1 ? "record" : "records"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <footer className="grid gap-2 border-t border-slate-200 bg-slate-50 px-4 py-4 sm:flex sm:justify-end sm:px-6">
              <button
                type="button"
                onClick={() => setMaintenancePickerOpen(false)}
                className="h-11 rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyMaintenanceSelection}
                disabled={
                  maintenancePickerLoading || !selectedMaintenanceUaKeys.length
                }
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-amber-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                Apply selection
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-slate-600">
      {label}
      {children}
    </label>
  );
}

function ReportCard({
  icon,
  title,
  description,
  accent,
  children
}: {
  icon: ReactNode;
  title: string;
  description: string;
  accent: "sky" | "emerald" | "amber" | "violet" | "rose";
  children: ReactNode;
}) {
  const colors = {
    sky: "border-t-sky-600 bg-sky-50 text-sky-700",
    emerald: "border-t-emerald-600 bg-emerald-50 text-emerald-700",
    amber: "border-t-amber-500 bg-amber-50 text-amber-700",
    violet: "border-t-violet-600 bg-violet-50 text-violet-700",
    rose: "border-t-rose-600 bg-rose-50 text-rose-700"
  }[accent];

  return (
    <section className={`flex min-w-0 flex-col rounded-lg border border-t-4 border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md sm:p-6 xl:min-h-[390px] ${colors.split(" ")[0]}`}>
      <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${colors}`}>
        {icon}
      </div>
      <h2 className="mt-4 text-xl font-bold text-slate-800">{title}</h2>
      <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
      <div className="mt-4 h-px bg-slate-100" />
      <div className="mt-5 flex flex-1 flex-col gap-4">{children}</div>
    </section>
  );
}

function GenerateButton({
  accent,
  busy,
  busyLabel,
  disabled,
  label,
  onClick
}: {
  accent: "sky" | "emerald" | "amber" | "violet" | "rose";
  busy: boolean;
  busyLabel: string;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const buttonColor = {
    sky: "bg-sky-700 hover:bg-sky-800 focus-visible:ring-sky-200",
    emerald: "bg-emerald-700 hover:bg-emerald-800 focus-visible:ring-emerald-200",
    amber: "bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-200",
    violet: "bg-violet-700 hover:bg-violet-800 focus-visible:ring-violet-200",
    rose: "bg-rose-700 hover:bg-rose-800 focus-visible:ring-rose-200"
  }[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mt-auto inline-flex h-12 w-full min-w-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold text-white shadow-sm transition focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${buttonColor}`}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      <span className="truncate">
        {busy ? busyLabel || "Preparing combined PDF..." : label}
      </span>
    </button>
  );
}
