import type {
  AcquisitionType,
  InteractionType,
  LeadStatus,
  PreferredContactMethod,
  Priority,
  TaskCategory,
  TaskStatus,
} from "@prisma/client";

export const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "Neu",
  RESEARCHED: "Recherchiert",
  TO_CONTACT: "Kontaktieren",
  CONTACTED: "Kontaktiert",
  REPLIED: "Antwort erhalten",
  INTERESTED: "Interessiert",
  APPOINTMENT: "Termin",
  OFFER_SENT: "Angebot gesendet",
  FOLLOW_UP: "Follow-up",
  WON: "Gewonnen",
  LOST: "Verloren",
  NOT_RELEVANT: "Nicht relevant",
  WALK_IN_PLANNED: "Walk-In geplant",
  VISITED_INTERESTED: "Besucht (Interessiert)",
  VISITED_NO_INTEREST: "Besucht (Kein Interesse)",
  DEMO_DISPATCHED: "Demo versendet",
};

export const ACQUISITION_TYPE_LABELS: Record<AcquisitionType, string> = {
  CALL: "Cold Call",
  WALK_IN: "Walk-In",
};

export const PIPELINE_STATUSES: LeadStatus[] = [
  "NEW",
  "RESEARCHED",
  "TO_CONTACT",
  "CONTACTED",
  "REPLIED",
  "INTERESTED",
  "APPOINTMENT",
  "OFFER_SENT",
  "FOLLOW_UP",
  "WON",
  "LOST",
  "WALK_IN_PLANNED",
  "VISITED_INTERESTED",
  "VISITED_NO_INTEREST",
  "DEMO_DISPATCHED",
];

export const NEXT_STATUS: Partial<Record<LeadStatus, LeadStatus>> = {
  NEW: "RESEARCHED",
  RESEARCHED: "TO_CONTACT",
  TO_CONTACT: "CONTACTED",
  CONTACTED: "REPLIED",
  REPLIED: "INTERESTED",
  INTERESTED: "APPOINTMENT",
  APPOINTMENT: "OFFER_SENT",
  OFFER_SENT: "FOLLOW_UP",
  FOLLOW_UP: "WON",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Niedrig",
  MEDIUM: "Mittel",
  HIGH: "Hoch",
};

export const PREFERRED_CONTACT_METHOD_LABELS: Record<PreferredContactMethod, string> = {
  INSTAGRAM_DM: "Instagram DM",
  WHATSAPP: "WhatsApp",
  PHONE: "Telefon",
  EMAIL: "E-Mail",
  CONTACT_FORM: "Kontaktformular",
  FACEBOOK_MESSENGER: "Facebook / Messenger",
  IN_PERSON: "Vor Ort",
  NOT_CONTACTABLE: "Nicht kontaktierbar",
};

export const INTERACTION_LABELS: Record<InteractionType, string> = {
  PHONE: "Telefon",
  IN_PERSON: "Persönlich",
  EMAIL: "E-Mail",
  INSTAGRAM: "Instagram DM",
  WHATSAPP: "WhatsApp",
  MEETING: "Meeting",
  OFFER: "Angebot",
  NOTE: "Notiz",
  CALL_RECORDING: "Call-Aufnahme",
};

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  SALES: "Sales / Akquise",
  ADMIN: "Admin",
  FOLLOW_UP: "Follow-up",
  COLD_OUTREACH: "Cold Outreach",
  OTHER: "Sonstiges",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  OPEN: "Offen",
  IN_PROGRESS: "In Bearbeitung",
  DONE: "Erledigt",
  CANCELLED: "Abgebrochen",
};

export const INDUSTRIES = [
  "Friseur",
  "Barber",
  "Kosmetik & Beauty",
  "Nagelstudio",
  "Massage & Wellness",
  "Fitness & PT",
  "Fotografie",
  "Handwerk",
  "Gastronomie",
  "Autopflege",
  "Fahrschule",
  "Immobilien",
  "Sonstige",
];
