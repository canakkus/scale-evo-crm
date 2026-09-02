export interface NavItemConfig {
  href: string;
  label: string;
  visible?: boolean;
}

export const DEFAULT_NAV_ITEMS: NavItemConfig[] = [
  { href: "/", label: "Dashboard", visible: true },
  { href: "/leads", label: "Leads", visible: true },
  { href: "/pipeline", label: "Pipeline", visible: true },
  { href: "/lead-scout", label: "Lead Scout", visible: true },
  { href: "/restaurant-scout", label: "Restaurant Scout", visible: true },
  { href: "/cold-calls", label: "Cold Calls", visible: true },
  { href: "/follow-ups", label: "Follow-ups", visible: true },
  { href: "/journal", label: "Journal", visible: true },
  { href: "/tasks", label: "Tasks", visible: true },
  { href: "/ai", label: "KI-Assistent", visible: true },
  { href: "/analytics", label: "Analytics", visible: true },
  { href: "/settings", label: "Einstellungen", visible: true },
];

/**
 * Resolves the merged list of nav items based on user's custom saved config
 */
export function resolveNavConfig(savedConfig?: NavItemConfig[] | null, restaurantScoutEnabled = true): NavItemConfig[] {
  if (!savedConfig || !Array.isArray(savedConfig) || savedConfig.length === 0) {
    return DEFAULT_NAV_ITEMS.map((item) => ({
      ...item,
      visible: item.href === "/restaurant-scout" ? (restaurantScoutEnabled && (item.visible ?? true)) : (item.visible ?? true),
    }));
  }

  // Create a map for quick lookup
  const savedMap = new Map<string, { visible: boolean }>();
  for (const item of savedConfig) {
    if (item && item.href) {
      savedMap.set(item.href, { visible: item.visible !== false });
    }
  }

  const result: NavItemConfig[] = [];
  const processedHrefs = new Set<string>();

  // 1. First add saved items in saved order
  for (const item of savedConfig) {
    const defaultItem = DEFAULT_NAV_ITEMS.find((d) => d.href === item.href);
    if (defaultItem && !processedHrefs.has(item.href)) {
      processedHrefs.add(item.href);
      const isScout = item.href === "/restaurant-scout";
      result.push({
        href: defaultItem.href,
        label: defaultItem.label,
        visible: isScout ? (restaurantScoutEnabled && (item.visible !== false)) : (item.visible !== false),
      });
    }
  }

  // 2. Append any missing new items that weren't in the saved config
  for (const defaultItem of DEFAULT_NAV_ITEMS) {
    if (!processedHrefs.has(defaultItem.href)) {
      const isScout = defaultItem.href === "/restaurant-scout";
      result.push({
        href: defaultItem.href,
        label: defaultItem.label,
        visible: isScout ? restaurantScoutEnabled : true,
      });
    }
  }

  return result;
}
