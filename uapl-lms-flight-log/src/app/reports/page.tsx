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
  accent: "sky" | "emerald" | "amber";
  children: ReactNode;
}) {
  const colors = {
    sky: "border-t-sky-600 bg-sky-50 text-sky-700",
    emerald: "border-t-emerald-600 bg-emerald-50 text-emerald-700",
    amber: "border-t-amber-500 bg-amber-50 text-amber-700"
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
    sky: "bg-sky-700 hover:bg-sky-800 focus-visible:ring-sky-200",
    emerald: "bg-emerald-700 hover:bg-emerald-800 focus-visible:ring-emerald-200",
    amber: "bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-200"
  }[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mt-auto inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold text-white shadow-sm transition focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${buttonColor}`}
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
