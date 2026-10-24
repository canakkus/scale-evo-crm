"use client";

import dynamic from "next/dynamic";

/** Loaded on open, so the lead table / map / pipeline first paint stays smaller. */
export const LeadDetailModal = dynamic(
  () => import("./lead-detail-modal").then((mod) => mod.LeadDetailModal),
  { loading: () => null },
);

export const LeadFormModal = dynamic(
  () => import("./lead-form-modal").then((mod) => mod.LeadFormModal),
  { loading: () => null },
);
