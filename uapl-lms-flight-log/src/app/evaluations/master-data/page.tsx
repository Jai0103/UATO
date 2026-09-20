"use client";

import {
  CheckCircle2,
  Edit3,
  ListChecks,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import {
  deleteFirebaseEvaluationQuestion,
  fetchFirebaseEvaluationQuestions,
  saveFirebaseEvaluationQuestion,
  type EvaluationQuestion,
  type EvaluationQuestionInput,
  type EvaluationQuestionType
} from "@/lib/evaluation-firebase-api";

const TEMPLATE_ID = "standard-course-evaluation-v1";

function emptyQuestion(sortOrder: number): EvaluationQuestionInput {
  return {
    id: "",
    templateId: TEMPLATE_ID,
    section: "Course Content",
    text: "",
    sortOrder,
    responseType: "rating",
    required: true,
    status: "active",
    scaleMin: 1,
    scaleMax: 5,
    scaleMinLabel: "Strongly disagree",
    scaleMaxLabel: "Strongly agree",
    options: []
  };
}

function inputFromQuestion(question: EvaluationQuestion): EvaluationQuestionInput {
  const { version: _version, createdAt: _createdAt, updatedAt: _updatedAt, ...input } =
    question;
  return input;
}

export default function EvaluationMasterDataPage() {
  const message = useAppMessage();
  const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<EvaluationQuestionInput | null>(null);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    try {
      setQuestions(await fetchFirebaseEvaluationQuestions());
    } catch (error) {
      message.error(
        "Evaluation questions could not be loaded",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  const sections = useMemo(
    () => Array.from(new Set(questions.map((item) => item.section))).sort(),
    [questions]
  );
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return questions.filter(
      (question) =>
        (!text || `${question.text} ${question.section}`.toLowerCase().includes(text)) &&
        (!section || question.section === section) &&
        (!status || question.status === status)
    );
  }, [query, questions, section, status]);

  async function saveQuestion(input: EvaluationQuestionInput) {
    if (!input.text.trim() || !input.section.trim()) {
      message.warning("Question incomplete", "Enter both a section and question text.");
      return;
    }
    if (input.responseType === "multipleChoice" && input.options.length < 2) {
      message.warning("Options required", "Add at least two answer options.");
      return;
    }
    setWorking(input.id ? "Updating evaluation question..." : "Adding evaluation question...");
    try {
      await saveFirebaseEvaluationQuestion(input);
      setEditing(null);
      await loadQuestions();
      message.success(
        input.id ? "Question updated" : "Question added",
        "Future evaluation sessions will use the latest active question version."
      );
    } catch (error) {
      message.error(
        "Question could not be saved",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setWorking("");
    }
  }

  async function toggleStatus(question: EvaluationQuestion) {
    setWorking("Updating question status...");
    try {
      await saveFirebaseEvaluationQuestion({
        ...inputFromQuestion(question),
        status: question.status === "active" ? "inactive" : "active"
      });
      await loadQuestions();
      message.success(
        question.status === "active" ? "Question deactivated" : "Question activated",
        "Historical evaluation records remain unchanged."
      );
    } catch (error) {
      message.error("Status update failed", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setWorking("");
    }
  }

  async function removeQuestion(question: EvaluationQuestion) {
    const confirmed = await message.confirm({
      title: "Delete this evaluation question?",
      message: "It will be removed from the question bank. Existing session snapshots and responses will remain available.",
      confirmLabel: "Delete question",
      variant: "danger"
    });
    if (!confirmed) return;
    setWorking("Deleting evaluation question...");
    try {
      await deleteFirebaseEvaluationQuestion(question.id);
      await loadQuestions();
      message.success("Question deleted", "Historical session questions were retained.");
    } catch (error) {
      message.error("Delete failed", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setWorking("");
    }
  }

  return (
    <AppShell>
      {loading ? <LoadingOverlay label="Loading evaluation questions..." /> : null}
      {working ? <LoadingOverlay label={working} /> : null}
      <div className="app-page">
        <section className="app-page-header">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700 ring-1 ring-violet-100">
                <SlidersHorizontal className="h-3.5 w-3.5" /> Evaluation master data
              </div>
              <h1 className="mt-3 text-2xl font-bold text-slate-950 sm:text-3xl">Evaluation Questions</h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Maintain the approved question bank used by future course evaluations.
              </p>
            </div>
            <button
              type="button"
              className="app-button-primary w-full sm:w-auto"
              onClick={() => setEditing(emptyQuestion(questions.length))}
            >
              <Plus className="h-4 w-4" /> Add question
            </button>
          </div>
        </section>

        <section className="app-card">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_170px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search questions or sections"
                className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
              />
            </label>
            <select value={section} onChange={(event) => setSection(event.target.value)} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="">All sections</option>
              {sections.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
                <tr><th className="px-5 py-4">Order</th><th className="px-5 py-4">Question</th><th className="px-5 py-4">Section</th><th className="px-5 py-4">Response</th><th className="px-5 py-4">Version</th><th className="px-5 py-4">Status</th><th className="px-5 py-4 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((question) => (
                  <tr key={question.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-semibold text-slate-500">{question.sortOrder + 1}</td>
                    <td className="max-w-xl px-5 py-4 font-semibold text-slate-900">{question.text}</td>
                    <td className="px-5 py-4 text-slate-600">{question.section}</td>
                    <td className="px-5 py-4 capitalize text-slate-600">{question.responseType.replace(/([A-Z])/g, " $1")}</td>
                    <td className="px-5 py-4 text-slate-600">v{question.version}</td>
                    <td className="px-5 py-4"><button type="button" onClick={() => void toggleStatus(question)} className={`rounded-full px-2.5 py-1 text-xs font-bold ${question.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{question.status === "active" ? "Active" : "Inactive"}</button></td>
                    <td className="px-5 py-4"><div className="flex justify-end gap-2"><IconButton label="Edit question" icon={Edit3} onClick={() => setEditing(inputFromQuestion(question))} /><IconButton label="Delete question" icon={Trash2} danger onClick={() => void removeQuestion(question)} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-slate-100 lg:hidden">
            {filtered.map((question) => (
              <article key={question.id} className="p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-violet-700">{question.section}</p><p className="mt-1 font-semibold leading-6 text-slate-950">{question.text}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${question.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{question.status}</span></div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{question.responseType} · v{question.version}</span><div className="flex gap-2"><IconButton label="Edit question" icon={Edit3} onClick={() => setEditing(inputFromQuestion(question))} /><IconButton label="Delete question" icon={Trash2} danger onClick={() => void removeQuestion(question)} /></div></div>
              </article>
            ))}
          </div>
          {!filtered.length && !loading ? <div className="p-10 text-center"><ListChecks className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-semibold text-slate-700">No evaluation questions found</p><p className="mt-1 text-sm text-slate-500">Adjust the filters or add the first question.</p></div> : null}
          <footer className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-500">{filtered.length} of {questions.length} questions</footer>
        </section>
      </div>
      {editing ? <QuestionModal input={editing} onClose={() => setEditing(null)} onSave={(input) => void saveQuestion(input)} /> : null}
    </AppShell>
  );
}

function IconButton({ label, icon: Icon, onClick, danger = false }: { label: string; icon: typeof Edit3; onClick: () => void; danger?: boolean }) {
  return <button type="button" onClick={onClick} title={label} aria-label={label} className={`flex h-10 w-10 items-center justify-center rounded-lg border bg-white transition ${danger ? "border-rose-200 text-rose-600 hover:bg-rose-50" : "border-slate-200 text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"}`}><Icon className="h-4 w-4" /></button>;
}

function QuestionModal({ input, onClose, onSave }: { input: EvaluationQuestionInput; onClose: () => void; onSave: (input: EvaluationQuestionInput) => void }) {
  const [form, setForm] = useState(input);
  const [optionsText, setOptionsText] = useState(input.options.join("\n"));
  const set = <K extends keyof EvaluationQuestionInput>(key: K, value: EvaluationQuestionInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  return <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-5"><button type="button" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" /><form onSubmit={(event) => { event.preventDefault(); onSave({ ...form, options: optionsText.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean) }); }} className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-lg bg-white shadow-2xl sm:max-w-2xl sm:rounded-lg"><header className="flex items-start justify-between border-b border-slate-200 p-5"><div><p className="text-xs font-bold uppercase text-violet-700">Question bank</p><h2 className="mt-1 text-xl font-bold text-slate-950">{form.id ? "Edit question" : "Add question"}</h2></div><IconButton label="Close" icon={X} onClick={onClose} /></header><div className="grid gap-4 overflow-y-auto p-5 sm:grid-cols-2"><Field label="Section"><input value={form.section} onChange={(event) => set("section", event.target.value)} required /></Field><Field label="Response type"><select value={form.responseType} onChange={(event) => set("responseType", event.target.value as EvaluationQuestionType)}><option value="rating">Rating scale</option><option value="yesNo">Yes / No</option><option value="multipleChoice">Multiple choice</option><option value="text">Written response</option></select></Field><div className="sm:col-span-2"><Field label="Question"><textarea value={form.text} onChange={(event) => set("text", event.target.value)} rows={3} required /></Field></div><Field label="Display order"><input type="number" min="1" value={form.sortOrder + 1} onChange={(event) => set("sortOrder", Math.max(0, Number(event.target.value) - 1))} /></Field><Field label="Status"><select value={form.status} onChange={(event) => set("status", event.target.value as "active" | "inactive")}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>{form.responseType === "rating" ? <><Field label="Low score label"><input value={form.scaleMinLabel} onChange={(event) => set("scaleMinLabel", event.target.value)} /></Field><Field label="High score label"><input value={form.scaleMaxLabel} onChange={(event) => set("scaleMaxLabel", event.target.value)} /></Field></> : null}{form.responseType === "multipleChoice" ? <div className="sm:col-span-2"><Field label="Options (one per line)"><textarea rows={4} value={optionsText} onChange={(event) => setOptionsText(event.target.value)} /></Field></div> : null}<label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 sm:col-span-2"><input type="checkbox" checked={form.required} onChange={(event) => set("required", event.target.checked)} className="h-4 w-4" /><span><span className="block text-sm font-semibold text-slate-900">Required response</span><span className="block text-xs text-slate-500">Learners must answer before submitting.</span></span></label></div><footer className="grid grid-cols-2 gap-2 border-t border-slate-200 bg-slate-50 p-4"><button type="button" onClick={onClose} className="h-12 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700">Cancel</button><button type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-sky-700 text-sm font-semibold text-white"><CheckCircle2 className="h-4 w-4" />Save question</button></footer></form></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold text-slate-700">{label}<div className="mt-1 [&>input]:h-11 [&>input]:w-full [&>input]:rounded-lg [&>input]:border [&>input]:border-slate-300 [&>input]:px-3 [&>input]:font-normal [&>select]:h-11 [&>select]:w-full [&>select]:rounded-lg [&>select]:border [&>select]:border-slate-300 [&>select]:bg-white [&>select]:px-3 [&>select]:font-normal [&>textarea]:w-full [&>textarea]:rounded-lg [&>textarea]:border [&>textarea]:border-slate-300 [&>textarea]:p-3 [&>textarea]:font-normal">{children}</div></label>;
}
