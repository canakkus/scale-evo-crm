"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
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
  ChevronLeft,
  ChevronRight,
  Zap,
  UtensilsCrossed,
  Menu,
  LogOut,
  AlertTriangle,
  Loader2,
  X as CloseIcon,
  User as UserIcon,
  Layers,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { DEFAULT_NAV_ITEMS, resolveNavConfig, type NavItemConfig } from "@/lib/nav-config";
import { ThemeToggle } from "@/components/theme-toggle";

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

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // User state & Feature toggles
  const [currentUser, setCurrentUser] = useState<{ displayName?: string; email?: string } | null>(null);
  const [navConfig, setNavConfig] = useState<NavItemConfig[]>(DEFAULT_NAV_ITEMS);
  const [restaurantScoutEnabled, setRestaurantScoutEnabled] = useState(true);

  // Logout confirmation modal state
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    function loadUserSettings() {
      fetch("/api/settings")
        .then((res) => res.json())
        .then((data) => {
          if (data?.currentUser) {
            setCurrentUser(data.currentUser);
            const scoutEnabled = data.currentUser.restaurantScoutEnabled ?? true;
            setRestaurantScoutEnabled(scoutEnabled);

            const resolved = resolveNavConfig(data.currentUser.sidebarConfig, scoutEnabled);
            setNavConfig(resolved);
          }
        })
        .catch((err) => console.error("Error loading user settings in sidebar:", err));
    }

    loadUserSettings();

    // Listen for setting changes from Settings page
    function handleSettingsUpdate(e: any) {
      if (e.detail?.restaurantScoutEnabled !== undefined) {
        setRestaurantScoutEnabled(e.detail.restaurantScoutEnabled);
      }
      if (e.detail?.sidebarConfig !== undefined) {
        setNavConfig(resolveNavConfig(e.detail.sidebarConfig, e.detail.restaurantScoutEnabled ?? true));
      }
    }

    window.addEventListener("user-settings-updated", handleSettingsUpdate);
    return () => {
      window.removeEventListener("user-settings-updated", handleSettingsUpdate);
    };
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (err) {
      console.error("Logout failed:", err);
      window.location.href = "/login";
    }
  }

  // Visible items based on user's custom sort and toggle state
  const visibleNavItems = navConfig.filter((item) => item.visible !== false);

  return (
    <>
      {/* Mobile/Tablet Floating Toggle Button */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Menü öffnen"
        className="md:hidden fixed bottom-4 left-4 z-40 flex items-center justify-center w-12 h-12 rounded-full shadow-xl border transition-all active:scale-95 cursor-pointer"
        style={{
          background: "var(--accent)",
          color: "var(--bg)",
          borderColor: "var(--border)",
        }}
      >
        <Menu size={22} strokeWidth={2.5} />
      </button>

      {/* Mobile/Tablet Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 animate-fade-in"
          style={{ background: "var(--overlay)", backdropFilter: "var(--overlay-blur)", WebkitBackdropFilter: "var(--overlay-blur)" }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "flex flex-col h-screen border-r shrink-0 transition-all duration-200 z-50",
          "max-md:fixed max-md:top-0 max-md:left-0 max-md:bottom-0 max-md:z-50 shadow-2xl md:shadow-none",
          mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full md:translate-x-0"
        )}
        style={{
          width: collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-w)",
          background: "var(--surface)",
          borderColor: "var(--border)",
          touchAction: "manipulation",
        }}
      >
        {/* Logo & Mobile Close */}
        <div
          className="flex items-center justify-between px-4 h-14 border-b shrink-0 overflow-hidden"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-7 h-7 rounded shrink-0"
              style={{ background: "var(--accent)", color: "var(--bg)" }}
            >
              <Zap size={14} strokeWidth={2.5} />
            </div>
            {!collapsed && (
              <span
                className="font-heading text-sm font-bold tracking-tight whitespace-nowrap"
                style={{ color: "var(--text)" }}
              >
                Scale Evo CRM
              </span>
            )}
          </div>

          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1.5 rounded-lg hover:bg-[var(--surface-3)] text-[var(--text-2)] cursor-pointer"
            aria-label="Menü schließen"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Nav Links */}
        <nav
          className="flex-1 overflow-y-auto py-3 px-2 space-y-1"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {visibleNavItems.map(({ href, label }) => {
            const Icon = NAV_ICON_MAP[href] || Layers;
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150 group relative select-none",
                  "hover:bg-[var(--surface-3)] active:scale-[0.98]",
                  isActive
                    ? "bg-[var(--surface-2)] text-[var(--text)] font-semibold"
                    : "text-[var(--text-2)]"
                )}
              >
                <Icon
                  size={18}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={cn(
                    "shrink-0 transition-colors",
                    isActive ? "text-[var(--accent)]" : "text-[var(--text-2)] group-hover:text-[var(--text)]"
                  )}
                />
                {!collapsed && (
                  <span className="truncate">
                    {label}
                  </span>
                )}
                {/* Active indicator */}
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full"
                    style={{ background: "var(--accent)" }}
                  />
                )}
              </Link>
            );
          })}

          {/* Theme Toggle & Logout */}
          <div className="pt-2 mt-2 border-t space-y-1" style={{ borderColor: "var(--border)" }}>
            <ThemeToggle collapsed={collapsed} />
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                setShowLogoutConfirm(true);
              }}
              title={collapsed ? "Abmelden" : undefined}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150 group relative select-none cursor-pointer",
                "text-red-400 hover:text-red-300 hover:bg-red-500/10 active:scale-[0.98] border border-transparent hover:border-red-500/20"
              )}
            >
              <LogOut
                size={18}
                strokeWidth={2}
                className="shrink-0 text-red-400 group-hover:text-red-300 transition-colors"
              />
              {!collapsed && (
                <span className="truncate font-medium">
                  Abmelden
                </span>
              )}
            </button>
          </div>
        </nav>

        {/* Subtle User Status Indicator at Bottom */}
        <div
          className="p-3 border-t shrink-0 flex items-center justify-between"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        >
          <Link
            href="/settings"
            title={currentUser ? `Eingeloggt als ${currentUser.displayName || currentUser.email}` : "Benutzer"}
            className="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-80 transition-opacity"
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[11px] shrink-0 border relative"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--accent)",
              }}
            >
              {currentUser?.displayName ? initials(currentUser.displayName) : <UserIcon size={13} />}
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-black" />
            </div>

            {!collapsed && (
              <div className="min-w-0 flex-1 leading-tight">
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-bold truncate" style={{ color: "var(--text)" }}>
                    {currentUser?.displayName || "Benutzer"}
                  </span>
                </div>
                <p className="text-[10px] truncate" style={{ color: "var(--text-3)" }}>
                  {currentUser?.email || "Online"}
                </p>
              </div>
            )}
          </Link>
        </div>

        {/* Collapse Toggle for Desktop / Tablet Landscape */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex absolute -right-3.5 top-16 z-10 items-center justify-center w-7 h-7 rounded-full border transition-transform hover:scale-110 shadow-sm active:scale-95 cursor-pointer"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border-2)",
            color: "var(--text-2)",
          }}
          aria-label={collapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
        >
          {collapsed ? (
            <ChevronRight size={14} strokeWidth={2.5} />
          ) : (
            <ChevronLeft size={14} strokeWidth={2.5} />
          )}
        </button>
      </aside>

      {/* Confirmation Modal: Really Logout? */}
      {showLogoutConfirm && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: "var(--overlay)", backdropFilter: "var(--overlay-blur)", WebkitBackdropFilter: "var(--overlay-blur)" }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border p-6 space-y-5 shadow-2xl animate-scale-up"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="flex items-start justify-between">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-400"
              >
                <AlertTriangle size={20} />
              </div>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="p-1 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-3)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <div className="space-y-1.5">
              <h4 className="font-heading text-base font-bold" style={{ color: "var(--text)" }}>
                Wirklich ausloggen?
              </h4>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
                Bist du sicher, dass du dich abmelden möchtest? Deine aktuelle Sitzung wird beendet und du musst dich erneut anmelden.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={loggingOut}
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold border transition-colors hover:bg-[var(--surface-2)] cursor-pointer"
                style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={loggingOut}
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 cursor-pointer"
              >
                {loggingOut ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Wird abgemeldet…</span>
                  </>
                ) : (
                  <>
                    <LogOut size={14} />
                    <span>Ja, wirklich ausloggen</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
