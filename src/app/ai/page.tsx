import { requireAuth } from "@/lib/auth";
import { AiChatComponent } from "@/components/ai/ai-chat-component";

export const metadata = { title: "KI-Assistent | Scale Evo CRM" };

export default async function AiPage() {
  await requireAuth();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          KI-Assistent
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          Nutze Gemini 2.0 Flash, um deine CRM-Daten zu analysieren, Outreach-Texte zu schreiben und strategische Empfehlungen einzuholen.
        </p>
      </div>

      <AiChatComponent />
    </div>
  );
}
