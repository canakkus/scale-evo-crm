/**
 * Discord Webhook Notification Service for ScaleEvo CRM
 *
 * Sends fire-and-forget notifications to Discord channels without
 * blocking API response times or exposing webhook credentials to the client.
 */

interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbedPayload {
  title: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  timestamp?: string;
}

const CRM_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://scale-evo-crm.vercel.app";

export function sendDiscordNotification(embed: DiscordEmbedPayload): void {
  const webhookUrl = process.env.DISCORD_SALES_WEBHOOK_URL;
  if (!webhookUrl) return;

  fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "ScaleEvo-CRM/1.0",
    },
    body: JSON.stringify({
      username: "ScaleEvo CRM",
      embeds: [embed],
    }),
  }).catch((err) => {
    console.error("[Discord Webhook] Failed to send notification:", err);
  });
}

/**
 * Notify when a new lead is created
 */
export function notifyLeadCreated(lead: {
  id: string;
  companyName: string;
  city?: string | null;
  status: string;
  industry?: string | null;
  creatorName?: string | null;
}): void {
  sendDiscordNotification({
    title: "📥 Neuer Lead eingetragen!",
    url: `${CRM_BASE_URL}/leads/${lead.id}`,
    color: 0x3b82f6, // ScaleEvo Blue
    fields: [
      { name: "Unternehmen", value: lead.companyName || "Unbenannt", inline: true },
      { name: "Ort", value: lead.city || "—", inline: true },
      { name: "Branche", value: lead.industry || "—", inline: true },
      { name: "Erfasst von", value: lead.creatorName || "Can", inline: true },
    ],
    footer: { text: "ScaleEvo CRM" },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Notify when a lead's stage/status changes to something meaningful
 */
export function notifyLeadStatusChanged(lead: {
  id: string;
  companyName: string;
  oldStatus: string;
  newStatus: string;
  userName?: string | null;
}): void {
  const isWon = lead.newStatus === "CLOSED_WON";
  const isMeeting = lead.newStatus === "MEETING_BOOKED";
  const isLost = lead.newStatus === "LOST";

  // Only notify on significant milestone status updates to prevent spam
  if (!isWon && !isMeeting && !isLost) return;

  let title = "🔄 Lead-Status geändert";
  let color = 0x6366f1; // Indigo default

  if (isWon) {
    title = "🎉 DEAL GECLOSED / CLOSED WON!";
    color = 0x10b981; // Green
  } else if (isMeeting) {
    title = "📅 TERMIN GEBUCHT / MEETING BOOKED!";
    color = 0x8b5cf6; // Purple
  } else if (isLost) {
    title = "❌ Lead verloren (Lost)";
    color = 0xef4444; // Red
  }

  sendDiscordNotification({
    title,
    url: `${CRM_BASE_URL}/leads/${lead.id}`,
    color,
    fields: [
      { name: "Unternehmen", value: lead.companyName, inline: true },
      { name: "Neuer Status", value: lead.newStatus, inline: true },
      { name: "Aktualisiert von", value: lead.userName || "Team", inline: true },
    ],
    footer: { text: "ScaleEvo CRM Pipeline" },
    timestamp: new Date().toISOString(),
  });
}
