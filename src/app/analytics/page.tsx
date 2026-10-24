import { requireAuth } from "@/lib/auth";
import { loadDashboard } from "@/lib/dashboard-data";
import { AnalyticsView } from "@/components/analytics/analytics-view";

export const metadata = { title: "Analytics | Scale Evo CRM" };

export default async function AnalyticsPage() {
  const user = await requireAuth();
  let initialData = null;
  try {
    initialData = await loadDashboard(user, { includeTeam: true });
  } catch (err) {
    console.error("[Analytics] Error fetching data:", err);
  }

  return <AnalyticsView initialData={initialData} />;
}
