import { requireAuth } from "@/lib/auth";
import { listLeads } from "@/lib/leads-list";
import { FollowUpsList } from "@/components/follow-ups/follow-ups-list";

export const metadata = { title: "Follow-ups | Scale Evo CRM" };

export default async function FollowUpsPage() {
  const user = await requireAuth();
  let initialLeads: Awaited<ReturnType<typeof listLeads>>["leads"] | null = null;
  try {
    initialLeads = (await listLeads(user, { status: "FOLLOW_UP", limit: 100 })).leads;
  } catch (err) {
    console.error("[Follow-ups] Error fetching data:", err);
    initialLeads = null;
  }

  return <FollowUpsList initialLeads={initialLeads} />;
}
