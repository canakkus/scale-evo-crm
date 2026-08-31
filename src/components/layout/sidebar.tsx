"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
  UtensilsCrossed,
  Menu,
  X as CloseIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/",            label: "Dashboard",    icon: LayoutDashboard },
  { href: "/leads",       label: "Leads",        icon: Users },
  { href: "/pipeline",    label: "Pipeline",     icon: Kanban },
  { href: "/lead-scout",  label: "Lead Scout",   icon: Search },
  { href: "/restaurant-scout", label: "Restaurant Scout", icon: UtensilsCrossed },
  { href: "/cold-calls",  label: "Cold Calls",   icon: Phone },
  { href: "/follow-ups",  label: "Follow-ups",   icon: Calendar },
  { href: "/journal",     label: "Journal",      icon: BookOpen },
  { href: "/tasks",       label: "Tasks",        icon: CheckSquare },
  { href: "/ai",          label: "KI-Assistent", icon: Bot },
  { href: "/analytics",   label: "Analytics",    icon: BarChart3 },
  { href: "/settings",    label: "Einstellungen",icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile/Tablet Floating Toggle Button */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Menü öffnen"
        className="md:hidden fixed bottom-4 left-4 z-40 flex items-center justify-center w-12 h-12 rounded-full shadow-xl border transition-all active:scale-95"
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
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-xs animate-fade-in"
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
            className="md:hidden p-1.5 rounded-lg hover:bg-[var(--surface-3)] text-[var(--text-2)]"
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
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
        </nav>

        {/* Collapse Toggle for Desktop / Tablet Landscape */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex absolute -right-3.5 top-16 z-10 items-center justify-center w-7 h-7 rounded-full border transition-transform hover:scale-110 shadow-sm active:scale-95"
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
    </>
  );
}
