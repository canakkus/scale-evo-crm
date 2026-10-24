import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getOptionalUser } from "@/lib/auth";
import type { NavItemConfig } from "@/lib/nav-config";

export type ShellUser = {
  id: string;
  email: string | null;
  displayName: string;
  restaurantScoutEnabled: boolean;
  sidebarConfig: NavItemConfig[] | null;
  baseAddress: string | null;
  baseLatitude: number | null;
  baseLongitude: number | null;
  preferredLocationMode: string | null;
};

function asNavConfig(value: unknown): NavItemConfig[] | null {
  if (!Array.isArray(value)) return null;
  const items: NavItemConfig[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.href !== "string") continue;
    const label = typeof record.label === "string" ? record.label : record.href;
    items.push({ href: record.href, label, visible: record.visible !== false });
  }
  return items.length > 0 ? items : null;
}

/**
 * One user-row read for the authenticated shell (sidebar + location).
 * Replaces the two client round-trips to /api/settings that used to run
 * after hydration on every page.
 */
export const getShellUser = cache(async (): Promise<ShellUser | null> => {
  const authUser = await getOptionalUser();
  if (!authUser) return null;

  const email = (authUser.email || "").toLowerCase();
  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase();
  const isPrimaryAdmin = Boolean(adminEmail) && email === adminEmail;
  const metadataName =
    typeof authUser.user_metadata?.displayName === "string"
      ? authUser.user_metadata.displayName
      : "";

  const dbUser = await prisma.user.findFirst({
    where: {
      OR: [
        { id: authUser.id },
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
      ],
    },
    select: {
      displayName: true,
      email: true,
      restaurantScoutEnabled: true,
      sidebarConfig: true,
      baseAddress: true,
      baseLatitude: true,
      baseLongitude: true,
      preferredLocationMode: true,
    },
  });

  return {
    id: authUser.id,
    email: authUser.email ?? dbUser?.email ?? null,
    displayName: dbUser?.displayName || metadataName || email.split("@")[0] || "Benutzer",
    restaurantScoutEnabled: dbUser ? dbUser.restaurantScoutEnabled : isPrimaryAdmin ? false : true,
    sidebarConfig: asNavConfig(dbUser?.sidebarConfig),
    baseAddress: dbUser?.baseAddress ?? null,
    baseLatitude: dbUser?.baseLatitude ?? null,
    baseLongitude: dbUser?.baseLongitude ?? null,
    preferredLocationMode: dbUser?.preferredLocationMode ?? "default",
  };
});
