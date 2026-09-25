import { prisma } from "@/lib/prisma";
import type { User } from "@supabase/supabase-js";

/** Stellt sicher, dass zum Auth-User ein DB-Datensatz existiert. */
export async function ensureDbUser(user: User) {
  const existing = await prisma.user.findUnique({ where: { id: user.id } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      id: user.id,
      email: user.email ?? "unknown@scaleevo.at",
      displayName: user.email?.split("@")[0] ?? "User",
    },
  });
}
