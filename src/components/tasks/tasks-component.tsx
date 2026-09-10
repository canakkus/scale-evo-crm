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
      {/* Top Banner / Actions - Apple HIG Style */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
            Aufgaben
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-2)" }}>
            Plane deine Vertriebsaktivitäten und nutze Gemini KI.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleAiPrioritize}
            disabled={aiPrioritizing}
            className="flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: "var(--status-warm-tx)" }}
          >
            {aiPrioritizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            KI-Tagesplan
          </button>

          <button
            onClick={() => setIsFormOpen(true)}
            className="flex items-center gap-1 text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: "var(--accent)" }}
          >
            <Plus className="w-5 h-5" />
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

      {/* New Task Form - iOS Settings Style Group */}
      {isFormOpen && (
        <form onSubmit={handleCreateTask} className="animate-fade-in mb-6">
          <div className="rounded-xl overflow-hidden border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="flex flex-col">
              <input
                required
                type="text"
                placeholder="Titel (z.B. 'Follow-up Call')"
                className="w-full px-4 py-3 text-[15px] bg-transparent outline-none border-b"
                style={{ borderColor: "var(--border)", color: "var(--text)" }}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
              <div className="flex flex-col sm:flex-row sm:items-center divide-y sm:divide-y-0 sm:divide-x" style={{ borderColor: "var(--border)" }}>
                <select
                  className="flex-1 px-4 py-3 text-[15px] bg-transparent outline-none appearance-none"
                  style={{ color: "var(--text)" }}
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as TaskCategory)}
                >
                  {Object.entries(TASK_CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <select
                  className="flex-1 px-4 py-3 text-[15px] bg-transparent outline-none appearance-none"
                  style={{ color: "var(--text)" }}
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as Priority)}
                >
                  <option value="LOW">Priorität: Niedrig</option>
                  <option value="MEDIUM">Priorität: Mittel</option>
                  <option value="HIGH">Priorität: Hoch</option>
                </select>
                <input
                  type="date"
                  className="flex-1 px-4 py-3 text-[15px] bg-transparent outline-none appearance-none"
                  style={{ color: "var(--text)" }}
                  value={newDueAt}
                  onChange={(e) => setNewDueAt(e.target.value)}
                />
              </div>
              <select
                className="w-full px-4 py-3 text-[15px] bg-transparent outline-none border-t appearance-none"
                style={{ borderColor: "var(--border)", color: "var(--text)" }}
                value={newLeadId}
                onChange={(e) => setNewLeadId(e.target.value)}
              >
                <option value="">— Kein Lead verknüpft —</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>{l.companyName}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-end gap-4 mt-3">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="text-[15px] font-medium"
              style={{ color: "var(--text-2)" }}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={creating}
              className="text-[15px] font-semibold"
              style={{ color: "var(--accent)" }}
            >
              {creating ? "Wird erstellt…" : "Hinzufügen"}
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar - iOS Segmented Control Style */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center p-0.5 rounded-lg border" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
          {["OPEN", "DONE", ""].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={cn(
                "px-4 py-1 rounded-md text-xs font-medium transition-all",
                statusFilter === st
                  ? "bg-[var(--surface)] text-[var(--text)] shadow-sm"
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
          className="rounded-lg px-3 py-1.5 text-xs border outline-none bg-transparent"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          <option value="">Alle Kategorien</option>
          {Object.entries(TASK_CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Tasks List - Apple Reminders Style */}
      <div className="flex flex-col pt-2">
        {loading ? (
          <div className="py-8 text-center text-[15px]" style={{ color: "var(--text-3)" }}>
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 opacity-50" />
            Laden…
          </div>
        ) : tasks.length === 0 ? (
          <div className="py-8 text-center text-[15px]" style={{ color: "var(--text-3)" }}>
            Keine Aufgaben vorhanden.
          </div>
        ) : (
          <div className="flex flex-col">
            {tasks.map((task, idx) => {
              const isDone = task.status === "DONE";
              return (
                <div
                  key={task.id}
                  className={cn(
                    "group flex items-start gap-3 py-3 transition-colors",
                    idx !== tasks.length - 1 && "border-b"
                  )}
                  style={{ borderColor: "var(--border)" }}
                >
                  <button
                    onClick={() => handleToggleTask(task.id, task.status)}
                    className="mt-0.5 shrink-0 transition-transform active:scale-90"
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-5 h-5" style={{ color: "var(--accent)", fill: "var(--accent)", stroke: "var(--bg)" }} />
                    ) : (
                      <Circle className="w-5 h-5" style={{ color: "var(--border-2)" }} />
                    )}
                  </button>

                  <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn("text-[15px] truncate", isDone ? "opacity-40 line-through" : "font-medium")}
                        style={{ color: "var(--text)" }}
                      >
                        {task.title}
                      </p>
                      <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-xs", isDone ? "opacity-40" : "")} style={{ color: "var(--text-2)" }}>
                        {task.dueAt && (
                          <span className={cn(new Date(task.dueAt) < new Date() && !isDone ? "text-red-500 font-medium" : "")}>
                            {formatDate(task.dueAt)}
                          </span>
                        )}
                        {task.lead && (
                          <>
                            <span className="opacity-40">•</span>
                            <span>{task.lead.companyName}</span>
                          </>
                        )}
                        <span className="opacity-40">•</span>
                        <span>{TASK_CATEGORY_LABELS[task.category as TaskCategory] || task.category}</span>
                      </div>
                    </div>

                    {/* Progressive Disclosure Action */}
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-1.5 rounded-md opacity-100 hover:bg-red-500/10 transition-all shrink-0 sm:ml-4"
                      style={{ color: "var(--status-lost-tx)" }}
                      title="Aufgabe löschen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

