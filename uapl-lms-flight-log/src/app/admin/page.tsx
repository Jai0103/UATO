import { ClipboardCheck, Clock, GraduationCap, Settings, Users } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";

const stats = [
  { label: "Students", value: "24", icon: GraduationCap },
  { label: "Pending Uploads", value: "7", icon: Clock },
  { label: "Trainers", value: "5", icon: Users },
  { label: "Completed Logs", value: "38", icon: ClipboardCheck }
];

export default function AdminPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor students, trainers, and flight log submissions.
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;

            return (
              <article
                key={stat.label}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                  <Icon size={20} className="text-brand-gold" />
                </div>
                <p className="mt-4 text-3xl font-semibold text-slate-950">
                  {stat.value}
                </p>
              </article>
            );
          })}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-navy text-white">
                <Settings size={18} />
              </div>

              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  Master Data
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Manage locations, batteries, instructors, UA models, and categories.
                </p>

                <Link
                  href="/master-data"
                  className="mt-4 inline-flex h-10 items-center rounded-md bg-brand-navy px-4 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Open Master Data
                </Link>
              </div>
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">
              User Management
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              User creation and email invitations will be connected in a later step.
            </p>
          </article>
        </section>
      </div>
    </AppShell>
  );
}
