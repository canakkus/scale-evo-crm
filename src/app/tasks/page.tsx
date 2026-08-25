import { requireAuth } from "@/lib/auth";
import { TasksComponent } from "@/components/tasks/tasks-component";

export const metadata = { title: "Productivity Center | Scale Evo CRM" };

export default async function TasksPage() {
  await requireAuth();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Productivity Center
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          Erfasse Aufgaben, priorisiere deine täglichen Vertriebsaktivitäten und erstelle KI-Tagespläne mit Gemini.
        </p>
      </div>

      <TasksComponent />
    </div>
  );
}
