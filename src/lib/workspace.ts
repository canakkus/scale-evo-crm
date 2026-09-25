import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * ============================================================
 * GETEILTE ARBEITSBEREICHE — wer sieht wessen Leads
 * ============================================================
 * Standard: jeder Account sieht nur Leads, die er angelegt hat oder die ihm
 * zugewiesen sind.
 *
 * `SHARED_WORKSPACE_EMAILS` verknuepft Accounts zu einer Gruppe, deren
 * Mitglieder gegenseitig ALLE Leads sehen und bearbeiten — auch kuenftige.
 * Gruppen mit ";" trennen, Mitglieder mit ",":
 *
 *   SHARED_WORKSPACE_EMAILS="oliver@x.at,can@y.com;anna@z.at,ben@z.at"
 *
 * Die Gruppe wird ausschliesslich aus der E-Mail der verifizierten Session
 * bestimmt, nie aus Request-Daten. Wer in keiner Gruppe steht, bleibt allein.
 *
 * Geteilt werden Leads samt allem, was am Lead haengt (Interaktionen,
 * Aufnahmen, Audits). Tasks, Scout-Sessions und DM-Entwuerfe bleiben
 * persoenlich.
 * ============================================================
 */

type SessionUser = { id: string; email?: string | null };

function parseGroups(raw: string | undefined): string[][] {
  return (raw ?? "")
    .split(";")
    .map((group) =>
      group
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    )
    .filter((group) => group.length > 1);
}

/**
 * E-Mails, mit denen dieser Account seinen Arbeitsbereich teilt (ohne sich
 * selbst). Steht ein Account in mehreren Gruppen, werden sie vereinigt —
 * sonst saehe bei "a,b;a,c" zwar c den Account a, a aber nicht c.
 */
export function sharedPartnerEmails(email: string | null | undefined): string[] {
  const own = email?.trim().toLowerCase();
  if (!own) return [];
  const partners = new Set<string>();
  for (const members of parseGroups(process.env.SHARED_WORKSPACE_EMAILS)) {
    if (members.includes(own)) members.forEach((member) => partners.add(member));
  }
  partners.delete(own);
  return [...partners];
}

/**
 * Alle User-IDs, deren Leads dieser Account sehen darf — immer inklusive
 * der eigenen. Ohne Gruppe genau `[user.id]`, also kein DB-Aufruf.
 */
export async function workspaceUserIds(user: SessionUser): Promise<string[]> {
  const partners = sharedPartnerEmails(user.email);
  if (partners.length === 0) return [user.id];

  // Die Gruppe gibt es nur, wenn ID und E-Mail der Session zum selben
  // DB-Account gehoeren. Sonst reichte ein Cookie mit fremder E-Mail und
  // beliebiger ID, um in die Gruppe zu kommen.
  const self = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true } });
  if (self?.email?.trim().toLowerCase() !== user.email?.trim().toLowerCase()) return [user.id];

  const rows = await prisma.user.findMany({
    where: { email: { in: partners, mode: "insensitive" } },
    select: { id: true },
  });
  return [user.id, ...rows.map((row) => row.id).filter((id) => id !== user.id)];
}

/** Prisma-Filter "Lead gehoert zu einem dieser Accounts". */
export function leadScopeFor(userIds: string[]): Prisma.LeadWhereInput {
  return {
    OR: [{ createdById: { in: userIds } }, { assignedToId: { in: userIds } }],
  };
}

/** Kurzform: Filter fuer den eingeloggten Account samt Arbeitsbereich. */
export async function leadScope(user: SessionUser): Promise<Prisma.LeadWhereInput> {
  return leadScopeFor(await workspaceUserIds(user));
}

/**
 * Fuer Service-Code, der nur die User-ID kennt (KI-Tools, Scouts). Die
 * E-Mail kommt aus der DB — dort steht sie seit dem ersten Login aus der
 * verifizierten Session.
 */
export async function leadScopeForUserId(userId: string): Promise<Prisma.LeadWhereInput> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return leadScope({ id: userId, email: row?.email ?? null });
}

/**
 * Laedt einen Lead NUR, wenn der Account ihn sehen darf. `null` heisst fuer
 * die Route: 404 — bewusst nicht 403, damit fremde IDs nicht bestaetigt werden.
 */
export async function findAccessibleLead(user: SessionUser, leadId: string) {
  return prisma.lead.findFirst({ where: { id: leadId, ...(await leadScope(user)) } });
}
