"use client";

import {
  CalendarRange,
  Download,
  GraduationCap,
  Loader2,
  Plane,
  Search,
  Wrench
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import { getSecureSession } from "@/lib/auth-api";
import {
  fetchBulkFlightReportRecords,
  fetchBulkStaffTrainingReportRecords,
  fetchBulkUaMaintenanceReportRecords
} from "@/lib/bulk-report-api";
import { createCombinedFlightLogPdf } from "@/lib/pdf";
import { createCombinedStaffTrainingPdf } from "@/lib/staff-training-pdf";
import { createCombinedUaMaintenancePdf } from "@/lib/ua-maintenance-pdf";

type ReportType = "flight" | "staff" | "maintenance";

const fieldClass = "app-input";

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

export default function ReportsPage() {
  const message = useAppMessage();
  const session = getSecureSession();
  const isAdmin = session?.role === "admin";
  const [working, setWorking] = useState<ReportType | null>(null);
  const [flightFrom, setFlightFrom] = useState(firstDayOfMonth());
  const [flightTo, setFlightTo] = useState(today());
  const [staffName, setStaffName] = useState("");
  const [staffMonthFrom, setStaffMonthFrom] = useState(currentMonth());
  const [staffMonthTo, setStaffMonthTo] = useState(currentMonth());
  const [maintenanceFrom, setMaintenanceFrom] = useState(firstDayOfMonth());
  const [maintenanceTo, setMaintenanceTo] = useState(today());

  async function generateFlightReport() {
    const validation = validateRange(flightFrom, flightTo, "flight date range");
    if (validation) {
      message.warning("Select a valid date range", validation);
      return;
    }
    setWorking("flight");
    try {
      const records = await fetchBulkFlightReportRecords({
        dateFrom: flightFrom,
        dateTo: flightTo
      });
      if (!records.length) {
        message.warning("No Flight Logs found", "Try a different date range.");
        return;
      }
      const doc = createCombinedFlightLogPdf(records);
      doc.save(`FLIGHT LOGS - ${flightFrom} TO ${flightTo}.pdf`);
      message.success(`${records.length} Flight Log report(s) combined`);
    } catch (error) {
      message.error(
        "Combined Flight Log could not be generated",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking(null);
    }
  }

  async function generateStaffReport() {
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
    try {
      const records = await fetchBulkStaffTrainingReportRecords({
        staffName: staffName.trim(),
        monthFrom: staffMonthFrom,
        monthTo: staffMonthTo
      });
      if (!records.length) {
        message.warning(
          "No Staff Training records found",
          "Try another staff name or month range."
        );
        return;
      }
      const doc = await createCombinedStaffTrainingPdf(records);
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
    }
  }

  async function generateMaintenanceReport() {
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
    try {
      const records = await fetchBulkUaMaintenanceReportRecords({
        dateFrom: maintenanceFrom,
        dateTo: maintenanceTo
      });
      if (!records.length) {
        message.warning(
          "No UA Maintenance records found",
          "Try a different date range."
        );
        return;
      }
      const doc = await createCombinedUaMaintenancePdf(records);
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
    }
  }

  return (
    <AppShell>
      {working ? (
        <LoadingOverlay
          label={
            working === "flight"
              ? "Preparing Flight Log reports..."
              : working === "staff"
                ? "Preparing Staff Training reports..."
                : "Preparing UA Maintenance reports..."
          }
          description="Collecting the selected records and building your combined PDF."
          delay={180}
        />
      ) : null}

      <div className="app-page">
        <header className="app-page-header">
          <div className="inline-flex items-center gap-2 rounded-md bg-[#edf5f8] px-2.5 py-1 text-xs font-bold uppercase text-[#075f8f] ring-1 ring-[#d5e9f1]">
            <CalendarRange className="h-4 w-4" /> Report Centre
          </div>
          <h1 className="mt-3 text-2xl font-bold text-[#16263c] sm:text-3xl">
            Combined Reports
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#6b7d92]">
            Generate operational report batches for the selected reporting period.
          </p>
        </header>

        <div className={`grid gap-5 ${isAdmin ? "xl:grid-cols-3" : "max-w-2xl"}`}>
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
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7e8fa3]" />
                  <input
                    className={`${fieldClass} mt-0 pl-10`}
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
              <GenerateButton
                accent="amber"
                busy={working === "maintenance"}
                disabled={working !== null}
                label="Download combined PDF"
                onClick={() => void generateMaintenanceReport()}
              />
            </ReportCard>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-[#405168]">
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
  accent: "sky" | "emerald" | "amber";
  children: ReactNode;
}) {
  const colors = {
    sky: {
      border: "border-t-[#1686b1]",
      icon: "bg-[#edf5f8] text-[#075f8f] ring-[#d5e9f1]"
    },
    emerald: {
      border: "border-t-emerald-600",
      icon: "bg-emerald-50 text-emerald-700 ring-emerald-200"
    },
    amber: {
      border: "border-t-amber-500",
      icon: "bg-amber-50 text-amber-700 ring-amber-200"
    }
  }[accent];

  return (
    <section className={`group flex min-w-0 flex-col rounded-lg border border-t-[3px] border-[#d7e0ea] bg-white p-5 shadow-[0_1px_2px_rgba(16,42,67,0.04),0_8px_24px_rgba(16,42,67,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(16,42,67,0.06),0_16px_36px_rgba(16,42,67,0.1)] sm:p-6 xl:min-h-[390px] ${colors.border}`}>
      <div className={`flex h-11 w-11 items-center justify-center rounded-lg ring-1 transition group-hover:scale-105 ${colors.icon}`}>
        {icon}
      </div>
      <h2 className="mt-4 text-xl font-bold text-[#16263c]">{title}</h2>
      <p className="mt-1 text-sm leading-5 text-[#6b7d92]">{description}</p>
      <div className="mt-4 h-px bg-[#e5ebf2]" />
      <div className="mt-5 flex flex-1 flex-col gap-4">{children}</div>
    </section>
  );
}

function GenerateButton({
  accent,
  busy,
  disabled,
  label,
  onClick
}: {
  accent: "sky" | "emerald" | "amber";
  busy: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const buttonColor = {
    sky: "bg-[#075f8f] hover:bg-[#064d75] focus-visible:ring-[#cce5ef]",
    emerald: "bg-emerald-700 hover:bg-emerald-800 focus-visible:ring-emerald-200",
    amber: "bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-200"
  }[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mt-auto inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold text-white shadow-[0_1px_2px_rgba(16,42,67,0.12),0_6px_16px_rgba(16,42,67,0.12)] transition hover:-translate-y-0.5 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 ${buttonColor}`}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {busy ? "Preparing combined PDF..." : label}
    </button>
  );
}
