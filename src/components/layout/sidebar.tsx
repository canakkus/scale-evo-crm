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
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/",            label: "Dashboard",    icon: LayoutDashboard },
  { href: "/leads",       label: "Leads",        icon: Users },
  { href: "/pipeline",    label: "Pipeline",     icon: Kanban },
  { href: "/lead-scout",  label: "Lead Scout",   icon: Search },
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

  return (
    <aside
      className="relative flex flex-col h-screen border-r shrink-0 transition-all duration-200"
      style={{
        width: collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-w)",
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-4 h-14 border-b shrink-0 overflow-hidden"
        style={{ borderColor: "var(--border)" }}
      >
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

      {/* Nav Links */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-all duration-150 group relative",
                "hover:bg-[var(--surface-3)]",
                isActive
                  ? "bg-[var(--surface-2)] text-[var(--text)]"
                  : "text-[var(--text-2)]"
              )}
            >
              <Icon
                size={16}
                strokeWidth={isActive ? 2.5 : 2}
                className={cn(
                  "shrink-0 transition-colors",
                  isActive ? "text-[var(--accent)]" : "text-[var(--text-2)] group-hover:text-[var(--text)]"
                )}
              />
              {!collapsed && (
                <span className={cn("truncate", isActive && "font-medium")}>
                  {label}
                </span>
              )}
              {/* Active indicator */}
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full"
                  style={{ background: "var(--accent)" }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-16 z-10 flex items-center justify-center w-6 h-6 rounded-full border transition-colors hover:bg-[var(--surface-3)]"
        style={{
          background: "var(--surface-2)",
          borderColor: "var(--border-2)",
          color: "var(--text-2)",
        }}
        aria-label={collapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
      >
        {collapsed ? (
          <ChevronRight size={12} strokeWidth={2.5} />
        ) : (
          <ChevronLeft size={12} strokeWidth={2.5} />
        )}
      </button>
    </aside>
  );
}
