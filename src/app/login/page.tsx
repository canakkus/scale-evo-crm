import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Anmelden | Scale Evo CRM" };

export default function LoginPage() {
  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: "var(--bg)" }}
    >
      <Suspense
        fallback={
          <div
            className="w-full max-w-sm rounded-xl border p-8 text-center"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <div
              className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-2"
              style={{
                borderColor: "var(--border-2)",
                borderTopColor: "var(--accent)",
              }}
            />
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              Lädt…
            </p>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
