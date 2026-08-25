"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  CheckCircle2,
  Circle,
  Calendar,
  Sparkles,
  Loader2,
  Trash2,
  Filter,
  CheckSquare,
  AlertCircle,
  Tag,
} from "lucide-react";
import { TASK_CATEGORY_LABELS, TASK_STATUS_LABELS, PRIORITY_LABELS } from "@/lib/constants";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import type { TaskCategory, TaskStatus, Priority } from "@prisma/client";

export function TasksComponent() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("OPEN");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  // New Task Form
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<TaskCategory>("SALES");
  const [newPriority, setNewPriority] = useState<Priority>("MEDIUM");
  const [newDueAt, setNewDueAt] = useState("");
  const [newLeadId, setNewLeadId] = useState("");
  const [leads, setLeads] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);

  // AI Prioritization State
  const [aiPrioritizing, setAiPrioritizing] = useState(false);
  const [aiResult, setAiResult] = useState<{ prioritized: string[]; reasoning: string } | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (categoryFilter) params.set("category", categoryFilter);

      const res = await fetch(`/api/tasks?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    fetch("/api/leads?limit=100")
      .then((res) => res.json())
      .then((data) => setLeads(data.leads || []))
      .catch((err) => console.error(err));
  }, []);

  async function handleToggleTask(id: string, currentStatus: TaskStatus) {
    const nextStatus = currentStatus === "DONE" ? "OPEN" : "DONE";
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        fetchTasks();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDeleteTask(id: string) {
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchTasks();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          category: newCategory,
          priority: newPriority,
          dueAt: newDueAt || null,
          leadId: newLeadId || null,
        }),
      });

      if (res.ok) {
        setNewTitle("");
        setNewDueAt("");
        setNewLeadId("");
        setIsFormOpen(false);
        fetchTasks();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  }

  async function handleAiPrioritize() {
    setAiPrioritizing(true);
    try {
      const res = await fetch("/api/tasks/prioritize", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setAiResult(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAiPrioritizing(false);
    }
  }

  const categoryColors: Record<TaskCategory, { bg: string; tx: string }> = {
    SALES:         { bg: "var(--status-warm-bg)", tx: "var(--status-warm-tx)" },
    ADMIN:         { bg: "var(--status-new-bg)", tx: "var(--status-new-tx)" },
    FOLLOW_UP:     { bg: "var(--status-planned-bg)", tx: "var(--status-planned-tx)" },
    COLD_OUTREACH: { bg: "var(--status-contacted-bg)", tx: "var(--status-contacted-tx)" },
    OTHER:         { bg: "var(--surface-3)", tx: "var(--text-2)" },
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions */}
      <div
        className="rounded-xl border p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div>
          <h2 className="font-heading text-lg font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
            <CheckSquare className="w-5 h-5" style={{ color: "var(--accent)" }} />
            Productivity Center & Aufgaben
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-2)" }}>
            Plane deine täglichen Vertriebsaktivitäten und nutze Gemini KI für eine priorisierte Tagesliste.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAiPrioritize}
            disabled={aiPrioritizing}
            className="flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold border transition-all"
            style={{ background: "var(--surface-2)", borderColor: "var(--border-2)", color: "var(--text)" }}
          >
            {aiPrioritizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" style={{ color: "var(--status-warm-tx)" }} />}
            KI-Tagesplan
          </button>

          <button
            onClick={() => setIsFormOpen(true)}
            className="flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold shadow-md transition-all"
            style={{ background: "var(--accent)", color: "var(--bg)" }}
          >
            <Plus className="w-4 h-4" />
            Neuer Task
          </button>
        </div>
      </div>

      {/* AI Prioritization Result Banner */}
      {aiResult && (
        <div className="rounded-xl border p-5 space-y-3 animate-fade-in" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold flex items-center gap-2" style={{ color: "var(--status-warm-tx)" }}>
              <Sparkles className="w-4 h-4" />
              Gemini Empfohlener Tagesplan
            </h3>
            <button onClick={() => setAiResult(null)} className="text-xs" style={{ color: "var(--text-3)" }}>
              Schließen
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--text-2)" }}>{aiResult.reasoning}</p>
          <div className="space-y-1.5 pt-1">
            {aiResult.prioritized.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--text)" }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--surface-3)", color: "var(--accent)" }}>
                  {idx + 1}
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Task Form (Collapsible/Inline) */}
      {isFormOpen && (
        <form onSubmit={handleCreateTask} className="rounded-xl border p-5 space-y-4 animate-fade-in" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--border)" }}>
            <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>Neuen Task anlegen</h3>
            <button type="button" onClick={() => setIsFormOpen(false)} style={{ color: "var(--text-3)" }}>
              <Plus className="w-4 h-4 rotate-45" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Titel *</label>
              <input
                required
                type="text"
                placeholder='z. B. "Follow-up Call bei Friseur Muster"'
                className="w-full rounded-md px-3 py-2 text-xs border outline-none"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Kategorie</label>
              <select
                className="w-full rounded-md px-3 py-2 text-xs border outline-none cursor-pointer"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as TaskCategory)}
              >
                {Object.entries(TASK_CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Priorität</label>
              <select
                className="w-full rounded-md px-3 py-2 text-xs border outline-none cursor-pointer"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as Priority)}
              >
                <option value="LOW">Niedrig</option>
                <option value="MEDIUM">Mittel</option>
                <option value="HIGH">Hoch</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Fälligkeitsdatum</label>
              <input
                type="date"
                className="w-full rounded-md px-3 py-2 text-xs border outline-none"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={newDueAt}
                onChange={(e) => setNewDueAt(e.target.value)}
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Mit Lead verknüpfen</label>
              <select
                className="w-full rounded-md px-3 py-2 text-xs border outline-none cursor-pointer"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={newLeadId}
                onChange={(e) => setNewLeadId(e.target.value)}
              >
                <option value="">— Keiner —</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>{l.companyName}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-3.5 py-1.5 text-xs font-medium rounded hover:bg-[var(--surface-3)]"
              style={{ color: "var(--text-2)" }}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-1.5 text-xs font-semibold rounded"
              style={{ background: "var(--accent)", color: "var(--bg)" }}
            >
              {creating ? "Erstellt…" : "Task Speichern"}
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {["OPEN", "DONE", ""].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                statusFilter === st
                  ? "bg-[var(--surface-3)] text-[var(--text)] font-semibold"
                  : "text-[var(--text-2)] hover:text-[var(--text)]"
              )}
            >
              {st === "OPEN" ? "Offen" : st === "DONE" ? "Erledigt" : "Alle"}
            </button>
          ))}
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md px-2.5 py-1.5 text-xs border outline-none cursor-pointer"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
        >
          <option value="">Alle Kategorien</option>
          {Object.entries(TASK_CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Tasks List */}
      <div className="rounded-xl border overflow-hidden shadow-sm" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        {loading ? (
          <div className="p-12 text-center text-xs" style={{ color: "var(--text-3)" }}>
            <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-2" style={{ borderColor: "var(--border-2)", borderTopColor: "var(--accent)" }} />
            Tasks werden geladen…
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-12 text-center text-xs" style={{ color: "var(--text-3)" }}>
            Keine Tasks gefunden.
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {tasks.map((task) => {
              const isDone = task.status === "DONE";
              const catStyle = categoryColors[task.category as TaskCategory] || categoryColors.OTHER;
              return (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-4 transition hover:bg-[var(--surface-3)] group"
                >
                  <div className="flex items-center gap-3.5 flex-1 min-w-0">
                    <button
                      onClick={() => handleToggleTask(task.id, task.status)}
                      className="shrink-0 transition-transform active:scale-90"
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-5 h-5" style={{ color: "var(--status-warm-tx)" }} />
                      ) : (
                        <Circle className="w-5 h-5" style={{ color: "var(--border-2)" }} />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn("text-sm font-semibold truncate", isDone && "line-through opacity-50")}
                          style={{ color: "var(--text)" }}
                        >
                          {task.title}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: catStyle.bg, color: catStyle.tx }}>
                          {TASK_CATEGORY_LABELS[task.category as TaskCategory] || task.category}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs" style={{ color: "var(--text-3)" }}>
                        {task.lead && (
                          <span style={{ color: "var(--accent)" }}>Lead: {task.lead.companyName}</span>
                        )}
                        {task.dueAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Fällig: {formatDate(task.dueAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--status-lost-bg)] transition-all"
                    style={{ color: "var(--status-lost-tx)" }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
