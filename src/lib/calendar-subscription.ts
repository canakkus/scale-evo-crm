import { prisma } from "@/lib/prisma";
import { generateCalendarFeedToken } from "@/lib/calendar-feed";

export async function ensureDbUser(user: { id: string; email?: string | null }) {
  const existing = await prisma.user.findUnique({ where: { id: user.id } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      id: user.id,
      email: user.email ?? "user@scaleevo.at",
      displayName: "User",
    },
  });
}

export async function ensureCalendarFeedToken(userId: string): Promise<string> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { calendarFeedToken: true },
  });
  if (!row) throw new Error("Benutzer nicht gefunden.");
  if (row.calendarFeedToken) return row.calendarFeedToken;

  const token = generateCalendarFeedToken();
  try {
    await prisma.user.update({ where: { id: userId }, data: { calendarFeedToken: token } });
    return token;
  } catch {
    const again = await prisma.user.findUnique({
      where: { id: userId },
      select: { calendarFeedToken: true },
    });
    if (again?.calendarFeedToken) return again.calendarFeedToken;
    throw new Error("Token konnte nicht angelegt werden.");
  }
}

export async function regenerateCalendarFeedToken(userId: string): Promise<string> {
  const token = generateCalendarFeedToken();
  await prisma.user.update({ where: { id: userId }, data: { calendarFeedToken: token } });
  return token;
}
