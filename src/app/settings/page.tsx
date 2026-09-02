"use client";

import { useState, useEffect } from "react";
import {
  Key,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  UtensilsCrossed,
  User,
  Sliders,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  RotateCcw,
  LayoutDashboard,
  Users,
  Kanban,
  Search,
  Phone,
  Calendar,
  BookOpen,
  CheckSquare,
  Bot,
  BarChart3,
  Settings as SettingsIcon,
  Check,
  Layers,
} from "lucide-react";
import { initials } from "@/lib/utils";
import { DEFAULT_NAV_ITEMS, resolveNavConfig, type NavItemConfig } from "@/lib/nav-config";

const NAV_ICON_MAP: Record<string, any> = {
  "/": LayoutDashboard,
  "/leads": Users,
  "/pipeline": Kanban,
  "/lead-scout": Search,
  "/restaurant-scout": UtensilsCrossed,
  "/cold-calls": Phone,
  "/follow-ups": Calendar,
  "/journal": BookOpen,
  "/tasks": CheckSquare,
  "/ai": Bot,
  "/analytics": BarChart3,
  "/settings": SettingsIcon,
};

export default function SettingsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [savingScout, setSavingScout] = useState(false);
  const [savingNav, setSavingNav] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Nav Items configuration state
  const [navItems, setNavItems] = useState<NavItemConfig[]>(DEFAULT_NAV_ITEMS);
  const [restaurantScoutEnabled, setRestaurantScoutEnabled] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((resData) => {
        setData(resData);
        const scoutEnabled = resData?.currentUser?.restaurantScoutEnabled ?? true;
        setRestaurantScoutEnabled(scoutEnabled);

        const resolved = resolveNavConfig(resData?.currentUser?.sidebarConfig, scoutEnabled);
        setNavItems(resolved);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggleRestaurantScout(newVal: boolean) {
    setRestaurantScoutEnabled(newVal);
    setSavingScout(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantScoutEnabled: newVal }),
      });
      if (res.ok) {
        // Update nav items scout visibility
        const updated = navItems.map((item) =>
          item.href === "/restaurant-scout" ? { ...item, visible: newVal } : item
        );
        setNavItems(updated);
        window.dispatchEvent(
          new CustomEvent("user-settings-updated", {
            detail: { restaurantScoutEnabled: newVal, sidebarConfig: updated },
          })
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingScout(false);
    }
  }

  async function saveSidebarConfig(newConfig: NavItemConfig[]) {
    setNavItems(newConfig);
    setSavingNav(true);
    setSaveSuccess(false);

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sidebarConfig: newConfig }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        window.dispatchEvent(
          new CustomEvent("user-settings-updated", {
            detail: { sidebarConfig: newConfig, restaurantScoutEnabled },
          })
        );
      }
    } catch (err) {
      console.error("Error saving sidebar config:", err);
    } finally {
      setSavingNav(false);
    }
  }

  function moveItem(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= navItems.length) return;

    const updated = [...navItems];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);

    saveSidebarConfig(updated);
  }

  function toggleItemVisibility(index: number) {
    const item = navItems[index];
    if (item.href === "/settings") return; // settings always visible

    const updated = [...navItems];
    updated[index] = { ...item, visible: !item.visible };

    saveSidebarConfig(updated);
  }

  function resetToDefault() {
    const defaultResolved = DEFAULT_NAV_ITEMS.map((item) => ({
      ...item,
      visible: item.href === "/restaurant-scout" ? restaurantScoutEnabled : true,
    }));
    saveSidebarConfig(defaultResolved);
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-xs" style={{ color: "var(--text-3)" }}>
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-2" style={{ borderColor: "var(--border-2)", borderTopColor: "var(--accent)" }} />
        Einstellungen werden geladen…
      </div>
    );
  }

  const currentUser = data?.currentUser;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Einstellungen & Profil
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          Konfiguriere deine Sidebar-Reihenfolge, Feature-Toggles und API-Schnittstellen nach deinem Workflow.
        </p>
      </div>

      <div className="space-y-5">
        {/* User Account Info Card */}
        <div
          className="rounded-xl border p-5 shadow-sm"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "var(--border)",
                  color: "var(--accent)",
                }}
              >
                {currentUser?.displayName ? initials(currentUser.displayName) : <User size={16} />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold" style={{ color: "var(--text-3)" }}>
                    Eingeloggt als
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: "var(--surface-2)", color: "var(--accent)", border: "1px solid var(--border)" }}>
                    {currentUser?.displayName || "Benutzer"}
                  </span>
                </div>
                <p className="text-xs font-mono font-medium mt-0.5" style={{ color: "var(--text)" }}>
                  {currentUser?.email || "Sitzung aktiv"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Sitzung aktiv</span>
            </div>
          </div>
        </div>

        {/* Sidebar Tabs Reordering & Customization Card */}
        <div
          className="rounded-xl border p-6 space-y-4 shadow-sm"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b" style={{ borderColor: "var(--border)" }}>
            <div>
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4" style={{ color: "var(--accent)" }} />
                <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>
                  Sidebar-Tabs sortieren & anpassen
                </h3>
              </div>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                Verschiebe wichtige Tabs nach oben oder blende selten genutzte Tabs aus.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {saveSuccess && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                  <Check size={12} /> Gespeichert
                </span>
              )}
              <button
                type="button"
                onClick={resetToDefault}
                disabled={savingNav}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors hover:bg-[var(--surface-2)] cursor-pointer"
                style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
              >
                <RotateCcw size={13} />
                <span>Standard</span>
              </button>
            </div>
          </div>

          {/* Nav Items List */}
          <div className="space-y-1.5 pt-1">
            {navItems.map((item, index) => {
              const Icon = NAV_ICON_MAP[item.href] || Layers;
              const isFirst = index === 0;
              const isLast = index === navItems.length - 1;
              const isVisible = item.visible !== false;

              return (
                <div
                  key={item.href}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                    isVisible ? "bg-[var(--surface-2)] opacity-100" : "bg-[var(--surface)] opacity-50"
                  }`}
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[11px] font-mono font-bold w-5 text-center shrink-0" style={{ color: "var(--text-3)" }}>
                      {index + 1}
                    </span>
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
                      style={{
                        background: "var(--surface)",
                        borderColor: "var(--border)",
                        color: isVisible ? "var(--accent)" : "var(--text-3)",
                      }}
                    >
                      <Icon size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate" style={{ color: "var(--text)" }}>
                        {item.label}
                      </p>
                      <p className="text-[10px] font-mono truncate" style={{ color: "var(--text-3)" }}>
                        {item.href}
                      </p>
                    </div>
                  </div>

                  {/* Actions: Reorder + Toggle Visibility */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Move Up */}
                    <button
                      type="button"
                      disabled={isFirst || savingNav}
                      onClick={() => moveItem(index, "up")}
                      title="Nach oben verschieben"
                      className="p-1.5 rounded-lg border transition-colors hover:bg-[var(--surface-3)] disabled:opacity-20 cursor-pointer"
                      style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
                    >
                      <ArrowUp size={13} />
                    </button>

                    {/* Move Down */}
                    <button
                      type="button"
                      disabled={isLast || savingNav}
                      onClick={() => moveItem(index, "down")}
                      title="Nach unten verschieben"
                      className="p-1.5 rounded-lg border transition-colors hover:bg-[var(--surface-3)] disabled:opacity-20 cursor-pointer"
                      style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
                    >
                      <ArrowDown size={13} />
                    </button>

                    {/* Visibility Toggle */}
                    {item.href !== "/settings" && (
                      <button
                        type="button"
                        onClick={() => toggleItemVisibility(index)}
                        title={isVisible ? "In Sidebar ausblenden" : "In Sidebar einblenden"}
                        className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                          isVisible
                            ? "hover:bg-[var(--surface-3)] text-emerald-400 border-emerald-500/20"
                            : "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20"
                        }`}
                      >
                        {isVisible ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Feature Toggles & Modules Card */}
        <div
          className="rounded-xl border p-6 space-y-4 shadow-sm"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4" style={{ color: "var(--accent)" }} />
            <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>
              Module & Feature-Toggles
            </h3>
          </div>

          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {/* Restaurant Scout Toggle */}
            <div className="py-3 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <UtensilsCrossed size={16} style={{ color: "var(--accent)" }} />
                  <p className="text-xs font-bold" style={{ color: "var(--text)" }}>
                    Restaurant Scout & Menü-Radar
                  </p>
                </div>
                <p className="text-[11px] max-w-lg leading-relaxed" style={{ color: "var(--text-3)" }}>
                  Automatisiertes Scouting von Gastronomiebetrieben via Google Places & Speisekarten-Erkennung per Gemini KI.
                </p>
              </div>

              {/* iOS Style Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={restaurantScoutEnabled}
                disabled={savingScout}
                onClick={() => handleToggleRestaurantScout(!restaurantScoutEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  restaurantScoutEnabled ? "bg-[var(--accent)]" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    restaurantScoutEnabled ? "translate-x-5 bg-black" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* System Integrations Card */}
        <div
          className="rounded-xl border p-6 space-y-4 shadow-sm"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
            <Key className="w-4 h-4" style={{ color: "var(--accent)" }} />
            API-Schlüssel & Schnittstellen
          </h3>

          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {/* Gemini */}
            <div className="py-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>Google Gemini API Key</p>
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>Pflicht für Call-Transkription, Speisekarten-Scan & KI-Assistent</p>
              </div>
              {data?.hasGeminiKey ? (
                <span className="flex items-center gap-1 text-xs font-bold" style={{ color: "var(--status-warm-tx)" }}>
                  <CheckCircle2 className="w-4 h-4" /> Konfiguriert
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-bold" style={{ color: "var(--status-lost-tx)" }}>
                  <XCircle className="w-4 h-4" /> Fehlt (.env)
                </span>
              )}
            </div>

            {/* Google Places */}
            <div className="py-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>Google Places API Key</p>
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>Optional für Lead-Autofill & Restaurant-Scout</p>
              </div>
              {data?.hasPlacesKey ? (
                <span className="flex items-center gap-1 text-xs font-bold" style={{ color: "var(--status-warm-tx)" }}>
                  <CheckCircle2 className="w-4 h-4" /> Konfiguriert
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-bold" style={{ color: "var(--status-planned-tx)" }}>
                  <XCircle className="w-4 h-4" /> Nicht aktiv (Optional)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* User Whitelist Card */}
        <div
          className="rounded-xl border p-6 space-y-3 shadow-sm"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
            <ShieldCheck className="w-4 h-4" style={{ color: "var(--status-warm-tx)" }} />
            Autorisierte Benutzer-E-Mails (Whitelist)
          </h3>
          <div className="flex flex-wrap gap-2 pt-1">
            {data?.allowedEmails?.map((email: string, i: number) => (
              <span
                key={i}
                className="px-3 py-1 rounded-md text-xs font-mono border"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--accent)" }}
              >
                {email}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
