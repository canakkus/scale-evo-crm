"use client";

import { useRouter } from "next/navigation";
import { LeadDetailModal } from "@/components/leads/lead-detail-modal";

export function LeadDetailPageComponent({ leadId }: { leadId: string }) {
  const router = useRouter();

  const handleClose = () => {
    // If there is history, navigate back; otherwise fallback to /leads
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/leads");
    }
  };

  return (
    <LeadDetailModal
      leadId={leadId}
      onClose={handleClose}
      onUpdate={() => {
        router.refresh();
      }}
    />
  );
}
