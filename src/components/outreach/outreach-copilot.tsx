"use client";

import { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Send,
  Copy,
  Check,
  Globe,
  Loader2,
  Flame,
  BookmarkCheck,
  Trash2,
  Edit3,
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
  onSelectScript?: (scriptText: string, draftId?: string, notes?: string) => void;
  onOpenEditor?: (scriptText: string) => void;
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
  onOpenEditor,
}: OutreachCopilotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [selectedScriptIdx, setSelectedScriptIdx] = useState<number | null>(null);
  const [selectingScriptIdx, setSelectingScriptIdx] = useState<number | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const chatStorageKey = (id: string) => `outreach_copilot_v1_${id}`;

  // Load chat from localStorage on mount / leadId change
  useEffect(() => {
    if (!leadId) return;
    try {
      const raw = localStorage.getItem(chatStorageKey(leadId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1 && Array.isArray(parsed.messages)) {
          setMessages(parsed.messages);
          return;
        }
      }
    } catch {}
    setMessages([]);
  }, [leadId]);

  // Persist chat debounced
  useEffect(() => {
    if (!leadId) return;
    const timer = setTimeout(() => {
      try {
        if (messages.length > 0) {
          localStorage.setItem(
            chatStorageKey(leadId),
            JSON.stringify({
              version: 1,
              messages,
              updatedAt: new Date().toISOString(),
            })
          );
        }
      } catch (e) {
        console.warn("[OutreachCopilot] localStorage save error:", e);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [leadId, messages]);

  const handleClearChat = () => {
    try {
      localStorage.removeItem(chatStorageKey(leadId));
    } catch {}
    setMessages([]);
    setSelectedScriptIdx(null);
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Initial generation or regeneration
  const handleGenerateScript = async (customInstruction?: string) => {
    setLoading(true);
    const userPrompt =
      customInstruction ||
      (companyName
        ? `Erstelle mir ein scharfes Kaltakquise-Skript für ${companyName}.`
        : "Erstelle mir ein scharfes Kaltakquise-Skript.");

    const newMessages: Message[] = [...messages, { role: "user", content: userPrompt }];
    setMessages(newMessages);
    setInputMessage("");

    try {
      const res = await fetch("/api/outreach/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          messages: newMessages,
          channel,
          tone,
        }),
      });

      const data = await res.json();
      if (res.ok && data.reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
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

  const handleSendChat = (e?: React.FormEvent) => {
    e?.preventDefault();
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
        onSelectScript?.(text, data.draftId, data.notes);
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
      className="flex flex-col h-full min-h-0 rounded-2xl border overflow-hidden"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      {/* Chat & Script Area (Full Height, No bulky header) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3.5 my-auto">
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
                Generiere direkt ein Skript für <strong>{companyName}</strong> oder kopiere unten 'Über uns'-Texte,
                Besonderheiten oder Einwände rein.
              </p>
            </div>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => void handleGenerateScript()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
                style={{
                  background: "var(--accent)",
                  color: "var(--bg)",
                }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>⚡ Skript für {companyName} generieren</span>
              </button>
            </div>
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
                        <div className="flex items-center gap-2">
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

                          {selectedScriptIdx === idx && onOpenEditor && (
                            <button
                              type="button"
                              onClick={() => onOpenEditor(msg.content)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:bg-[var(--surface-3)] text-orange-400 animate-fade-in"
                              style={{ borderColor: "rgba(249, 115, 22, 0.4)", background: "var(--surface)" }}
                              title="Dieses Skript im Editor öffnen & verfeinern"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Im Editor bearbeiten ↗</span>
                            </button>
                          )}
                        </div>

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
        className="p-3 border-t space-y-2 shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        {messages.length > 0 && (
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-0.5 no-scrollbar">
            <div className="flex items-center gap-1.5 shrink-0">
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

            <button
              type="button"
              onClick={handleClearChat}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md hover:bg-[var(--surface-3)] transition-colors text-[var(--text-3)] hover:text-red-400 shrink-0 ml-auto"
              title="Chat-Verlauf für diesen Lead leeren"
            >
              <Trash2 className="w-3 h-3" />
              <span>Chat leeren</span>
            </button>
          </div>
        )}

        <form onSubmit={handleSendChat} className="flex items-end gap-2">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendChat();
              }
            }}
            disabled={loading}
            rows={Math.min(4, Math.max(1, inputMessage.split("\n").length))}
            placeholder="Mit Groq sprechen, Wünsche anpassen oder 'Über uns'-Infos hier reinkopieren..."
            className="flex-1 rounded-xl px-3.5 py-2.5 text-xs outline-none border focus:ring-1 transition-all resize-none max-h-32 overflow-y-auto overflow-x-hidden no-scrollbar whitespace-pre-wrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border-2)",
              color: "var(--text)",
              scrollbarWidth: "none",
            }}
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || loading}
            className="px-3.5 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all disabled:opacity-40 active:scale-95 shrink-0"
            style={{
              background: "var(--accent)",
              color: "var(--bg)",
            }}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Senden</span>
          </button>
        </form>
      </div>
    </div>
  );
}
