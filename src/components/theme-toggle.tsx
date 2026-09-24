"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-10 w-full animate-pulse bg-[var(--surface-2)] rounded-lg"></div>;
  }

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={collapsed ? (isDark ? "Light Mode" : "Dark Mode") : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150 group relative select-none w-full",
        "hover:bg-[var(--surface-3)] active:scale-[0.98]",
        "text-[var(--text-2)]"
      )}
    >
      {isDark ? (
        <Sun size={18} strokeWidth={2} className="shrink-0 group-hover:text-[var(--text)] transition-colors" />
      ) : (
        <Moon size={18} strokeWidth={2} className="shrink-0 group-hover:text-[var(--text)] transition-colors" />
      )}
      {!collapsed && (
        <span className="truncate">
          {isDark ? "Light Mode" : "Dark Mode"}
        </span>
      )}
    </button>
  );
}
