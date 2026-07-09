import { Plane } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-light px-6">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-brand-navy text-white">
            <Plane size={22} />
          </div>

          <div>
            <h1 className="text-xl font-semibold text-slate-950">
              UAPL LMS
            </h1>
            <p className="text-sm text-slate-500">
              Flight Log Management System
            </p>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-900">
            Project setup successful.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Next step: login and role-based access.
          </p>
        </div>
      </section>
    </main>
  );
}
