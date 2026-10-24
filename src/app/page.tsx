import { requireAuth } from "@/lib/auth";
import { loadDashboard } from "@/lib/dashboard-data";
import { DashboardComponent } from "@/components/dashboard/dashboard-component";

export const metadata = { title: "Dashboard | Scale Evo CRM" };

async function getDashboardData(user: { id: string; email?: string | null }) {
  try {
    return await loadDashboard(user);
  } catch (err) {
    console.error("[Dashboard] Error fetching data:", err);
    return null;
  }
}

export default async function DashboardPage() {
  const user = await requireAuth();
  const initialData = await getDashboardData(user);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Dashboard
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          Willkommen zurück in Scale Evo CRM 3.0 — Übersicht deiner Vertriebs-Pipeline und KI-Aktivitäten.
        </p>
      </div>

      <DashboardComponent initialData={initialData} />
    </div>
  );
}
