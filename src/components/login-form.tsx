"use client";

import { Loader2, LogIn, Zap } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    searchParams.get("error") === "unauthorized"
      ? "Zugriff verweigert. Diese E-Mail ist nicht autorisiert."
      : ""
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "").trim();

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError("Anmeldung fehlgeschlagen. E-Mail und Passwort prüfen.");
        setLoading(false);
        return;
      }

      const nextUrl = searchParams.get("next");
      router.replace(nextUrl && nextUrl.startsWith("/") ? nextUrl : "/");
      router.refresh();
    } catch {
      setError("Ein unerwarteter Fehler ist aufgetreten.");
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm rounded-xl border p-8 shadow-lg"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      <div className="mb-6 text-center">
        <div
          className="mx-auto mb-3 flex items-center justify-center w-10 h-10 rounded-lg shrink-0"
          style={{ background: "var(--accent)", color: "var(--bg)" }}
        >
          <Zap size={20} strokeWidth={2.5} />
        </div>
        <h1
          className="font-heading text-2xl font-bold tracking-tight"
          style={{ color: "var(--text)" }}
        >
          Scale Evo CRM
        </h1>
        <p className="mt-1.5 text-xs" style={{ color: "var(--text-2)" }}>
          Geschützter Zugang für das Akquise-Team
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--text-2)" }}
          >
            E-Mail-Adresse
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-md px-3 py-2 text-sm border outline-none transition-colors"
            style={{
              background: "var(--surface-2)",
              borderColor: "var(--border)",
              color: "var(--text)",
            }}
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--text-2)" }}
          >
            Passwort
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-md px-3 py-2 text-sm border outline-none transition-colors"
            style={{
              background: "var(--surface-2)",
              borderColor: "var(--border)",
              color: "var(--text)",
            }}
          />
        </div>
      </div>

      {error && (
        <div
          className="mt-4 rounded-md px-3 py-2 text-xs font-medium border"
          style={{
            background: "var(--status-lost-bg)",
            color: "var(--status-lost-tx)",
            borderColor: "rgba(224, 104, 104, 0.3)",
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all"
        style={{
          background: "var(--accent)",
          color: "var(--bg)",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <LogIn className="w-4 h-4" />
        )}
        {loading ? "Anmeldung läuft…" : "Anmelden"}
      </button>
    </form>
  );
}
