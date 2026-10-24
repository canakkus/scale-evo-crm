"use client";

import { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Send,
  Copy,
  Check,
  Globe,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
  FileText,
  MessageSquare,
  Flame,
  BookmarkCheck,
} from "lucide-react";
import { MarkdownContent } from "@/components/ui/markdown-content";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type OutreachCopilotProps = {
  leadId: string;
  companyName: string;
  website?: string | null;
  channel?: "PHONE" | "WALK_IN" | "INSTAGRAM_DM";
  tone?: "CASUAL_VIENNESE" | "PROFESSIONAL_DU" | "FORMAL_SIE";
  onSelectScript?: (scriptText: string, draftId?: string) => void;
};

const SUGGESTIONS = [
  "Mach es kürzer & knackiger",
  "Fokussier auf Online-Termine statt Anrufe",
  "Mehr Wiener Schmäh / lockerer",
  "Wie reagiere ich auf 'Chef ist nicht da'?",
  "Wie reagiere ich auf 'Haben genug Kunden'?",
];

export function OutreachCopilot({
  leadId,
  companyName,
  website,
  channel = "PHONE",
  tone = "CASUAL_VIENNESE",
  onSelectScript,
}: OutreachCopilotProps) {
  const [contextText, setContextText] = useState("");
  const [isFeedOpen, setIsFeedOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [selectedScriptIdx, setSelectedScriptIdx] = useState<number | null>(null);
  const [selectingScriptIdx, setSelectingScriptIdx] = useState<number | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Initial generation or regeneration
  const handleGenerateScript = async (customInstruction?: string) => {
    setLoading(true);
    const userPrompt =
      customInstruction ||
      (contextText.trim()
        ? `Erstelle mir ein Kaltakquise-Skript basierend auf diesem "Über uns" / Website-Text:\n\n${contextText.trim()}`
        : `Erstelle mir ein scharfes Kaltakquise-Skript für ${companyName}.`);

    const newMessages: Message[] = [...messages, { role: "user", content: userPrompt }];
    setMessages(newMessages);
    setInputMessage("");

    try {
      const res = await fetch("/api/outreach/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          contextText: contextText.trim(),
          messages: newMessages,
          channel,
          tone,
        }),
      });

      const data = await res.json();
      if (res.ok && data.reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
        setIsFeedOpen(false); // Nach erfolgreicher Generierung einklappen für mehr Platz
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `⚠️ Fehler: ${data.error || "Antwort konnte nicht generiert werden."}` },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ Netzwerkfehler: ${err.message || "Unbekannter Fehler"}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || loading) return;
    const msg = inputMessage.trim();
    setInputMessage("");
    void handleGenerateScript(msg);
  };

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSelectScript = async (text: string, idx: number) => {
    setSelectingScriptIdx(idx);
    setSelectError(null);
    try {
      const res = await fetch("/api/outreach/select-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          scriptText: text,
          channel: channel === "PHONE" ? "PHONE" : "INSTAGRAM_DM",
          tone,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSelectedScriptIdx(idx);
        onSelectScript?.(text, data.draftId);
      } else {
        setSelectError(data.error || "Skript konnte nicht gespeichert werden.");
      }
    } catch (err: any) {
      console.error("Fehler beim Übernehmen des Skripts:", err);
      setSelectError("Netzwerkfehler beim Speichern des Skripts.");
    } finally {
      setSelectingScriptIdx(null);
    }
  };

  return (
    <div
      className="flex flex-col h-full rounded-2xl border overflow-hidden"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 border-b flex items-center justify-between"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs"
            style={{ background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)", color: "#fff" }}
          >
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: "var(--text)" }}>
                Groq Kaltakquise Copilot
              </span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-mono font-semibold"
                style={{ background: "rgba(249, 115, 22, 0.15)", color: "#f97316" }}
              >
                Llama 70B · Ultra-Fast
              </span>
            </div>
            <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
              Füttere „Über uns“-Infos für individuelle Hooks & Einwandbehandlung
            </p>
          </div>
        </div>

        {website && (
          <a
            href={website.startsWith("http") ? website : `https://${website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md hover:underline"
            style={{ background: "var(--surface-3)", color: "var(--text-2)" }}
            title="Website öffnen zum Kopieren der Über-uns-Seite"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Website ↗</span>
          </a>
        )}
      </div>

      {/* Accordion: Context Feed Area */}
      <div
        className="border-b transition-all"
        style={{
          borderColor: "var(--border)",
          background: isFeedOpen ? "var(--surface-2)" : "transparent",
        }}
      >
        <button
          type="button"
          onClick={() => setIsFeedOpen(!isFeedOpen)}
          className="w-full px-4 py-2 flex items-center justify-between text-xs font-semibold hover:bg-[var(--surface-3)] transition-colors"
          style={{ color: "var(--text-2)" }}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
            <span>
              {contextText.trim()
                ? `Website-Kontext hinterlegt (${contextText.trim().length} Zeichen)`
                : "Website / „Über uns“-Text hier reinfüttern"}
            </span>
          </div>
          {isFeedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {isFeedOpen && (
          <div className="px-4 pb-3 space-y-2">
            <textarea
              value={contextText}
              onChange={(e) => setContextText(e.target.value)}
              placeholder="Kopiere hier den Text der 'Über uns'-Seite, Philosophie, Speisekarte oder Besonderheiten rein (z. B. 'Familienbetrieb seit 1985, Meisterbetrieb, nur Bio-Produkte')..."
              rows={3}
              className="w-full rounded-xl p-3 text-xs outline-none border focus:ring-1 transition-all resize-y"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border-2)",
                color: "var(--text)",
              }}
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                Tipp: Groq baut aus der echten Story deinen perfekten Gesprächseinstieg.
              </span>
              <button
                type="button"
                onClick={() => void handleGenerateScript()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                style={{
                  background: "var(--accent)",
                  color: "var(--bg)",
                }}
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{messages.length === 0 ? "Skript generieren" : "Skript neu erstellen"}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Chat & Script Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(249, 115, 22, 0.1)", color: "#f97316" }}
            >
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold" style={{ color: "var(--text)" }}>
                Bereit für die Kaltakquise
              </h4>
              <p className="text-xs max-w-sm mt-1" style={{ color: "var(--text-3)" }}>
                Wirf oben Text aus der Website von <strong>{companyName}</strong> rein oder klick direkt auf Skript
                generieren. Danach kannst du mit Groq sprechen und das Skript live anpassen!
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleGenerateScript()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
              style={{
                background: "var(--accent)",
                color: "var(--bg)",
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Direkt Skript ohne Zusatztext generieren</span>
            </button>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isAssistant = msg.role === "assistant";
            return (
              <div
                key={idx}
                className={`flex flex-col ${isAssistant ? "items-start" : "items-end"} space-y-1`}
              >
                <div className="flex items-center gap-1 text-[10px] px-1 font-semibold" style={{ color: "var(--text-3)" }}>
                  {isAssistant ? (
                    <>
                      <span>⚡ Groq Llama</span>
                    </>
                  ) : (
                    <span>Du</span>
                  )}
                </div>
                <div
                  className={`relative rounded-2xl p-4 text-xs leading-relaxed max-w-[95%] select-text border shadow-sm ${
                    isAssistant ? "w-full" : "font-medium whitespace-pre-wrap"
                  }`}
                  style={{
                    background: isAssistant ? "var(--surface-2)" : "var(--accent)",
                    color: isAssistant ? "var(--text)" : "var(--bg)",
                    borderColor: isAssistant ? "var(--border)" : "transparent",
                  }}
                >
                  {isAssistant ? (
                    <div className="space-y-3">
                      <MarkdownContent content={msg.content} />

                      <div
                        className="pt-2 border-t flex flex-wrap items-center justify-between gap-2"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <button
                          type="button"
                          onClick={() => void handleSelectScript(msg.content, idx)}
                          disabled={selectingScriptIdx !== null}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border active:scale-95 disabled:opacity-60 shadow-xs"
                          style={{
                            background:
                              selectedScriptIdx === idx
                                ? "rgba(16, 185, 129, 0.15)"
                                : "var(--surface)",
                            borderColor:
                              selectedScriptIdx === idx ? "#10b981" : "var(--border)",
                            color:
                              selectedScriptIdx === idx ? "#10b981" : "var(--text)",
                          }}
                          title="Dieses Skript für Outreach festlegen und in den Lead-Notizen protokollieren"
                        >
                          {selectingScriptIdx === idx ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500" />
                              <span>Wird gespeichert…</span>
                            </>
                          ) : selectedScriptIdx === idx ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                              <span>Für Outreach & Notizen ausgewählt ✓</span>
                            </>
                          ) : (
                            <>
                              <BookmarkCheck className="w-3.5 h-3.5 text-orange-500" />
                              <span>Skript auswählen & Notiz anlegen</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => copyToClipboard(msg.content, idx)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all hover:bg-[var(--surface-3)]"
                          style={{
                            borderColor: "var(--border)",
                            background: "var(--surface)",
                            color: "var(--text-2)",
                          }}
                          title="Vollständiges Skript in Zwischenablage kopieren"
                        >
                          {copiedIndex === idx ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                              <span>Kopiert</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Kopieren</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            );
          })
        )}

        {loading && (
          <div className="flex items-center gap-2 p-3 rounded-xl border animate-pulse" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
            <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
            <span className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
              Groq überlegt & schreibt dein Kaltakquise-Skript…
            </span>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Quick Suggestions & Chat Input */}
      <div
        className="p-3 border-t space-y-2.5"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        {messages.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {SUGGESTIONS.map((sug, i) => (
              <button
                key={i}
                type="button"
                onClick={() => void handleGenerateScript(sug)}
                disabled={loading}
                className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border hover:bg-[var(--surface-3)] transition-colors disabled:opacity-40"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--text-2)",
                }}
              >
                + {sug}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSendChat} className="flex items-center gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={loading}
            placeholder="Mit Groq sprechen (z. B. 'Mach den Einstieg frecher' oder 'Erwähne Chef Martin')..."
            className="flex-1 rounded-xl px-3.5 py-2.5 text-xs outline-none border focus:ring-1 transition-all"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border-2)",
              color: "var(--text)",
            }}
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || loading}
            className="px-3.5 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-all disabled:opacity-40 active:scale-95"
            style={{
              background: "var(--accent)",
              color: "var(--bg)",
            }}
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Senden</span>
          </button>
        </form>
      </div>
    </div>
  );
}
