import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { leadScope } from "@/lib/workspace";
import { notFound } from "next/navigation";
import { LeadDetailPageComponent } from "@/components/leads/lead-detail-page-component";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const lead = await prisma.lead.findUnique({
      where: { id },
      select: { companyName: true },
    });
    return {
      title: lead?.companyName
        ? `${lead.companyName} | Scale Evo CRM`
        : "Lead Details | Scale Evo CRM",
    };
  } catch {
    return { title: "Lead Details | Scale Evo CRM" };
  }
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const { id } = await params;

  const lead = await prisma.lead.findFirst({
    where: {
      id,
      ...(await leadScope(user)),
    },
    select: { id: true, companyName: true },
  });

  if (!lead) {
    notFound();
  }

  return <LeadDetailPageComponent leadId={lead.id} />;
}
