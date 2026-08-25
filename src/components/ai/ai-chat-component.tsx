"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Sparkles, Loader2, Bot, User, RefreshCw, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const QUICK_PROMPTS = [
  "Welche Leads sollte ich diese Woche kontaktieren?",
  "Erstelle mir ein Instagram-DM Script für Friseure ohne Website",
  "Fasse meine aktuellen Leads und offenen Tasks zusammen",
  "Wie reagiere ich auf den Einwand 'Ich habe bereits Stammkunden'?",
];

function parseInlineMarkdown(text: string) {
  // Simple bold parsing: **bold**
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return <strong key={i} className="font-bold text-[var(--text)]">{part}</strong>;
    }

    // Also parse inline code or highlights `code`
    const codeParts = part.split(/`([^`]+)`/g);
    return codeParts.map((codePart, j) => {
      if (j % 2 === 1) {
        return (
          <code key={j} className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ background: "var(--surface-3)", color: "var(--accent)" }}>
            {codePart}
          </code>
        );
      }
      return codePart;
    });
  });
}

function renderMarkdown(text: string) {
  if (!text) return null;

  // Split text by lines
  const lines = text.split("\n");

  return lines.map((line, index) => {
    let content = line;

    // Check if line is a header
    const isHeader = content.startsWith("###") || content.startsWith("##") || content.startsWith("#");
    if (isHeader) {
      const headerText = content.replace(/^#+\s*/, "");
      return (
        <h4 key={index} className="font-bold text-xs mt-3 mb-1.5 text-[var(--text)]">
          {parseInlineMarkdown(headerText)}
        </h4>
      );
    }

    // Check if it's a bullet point
    const isBullet = content.trim().startsWith("*") || content.trim().startsWith("-");
    if (isBullet) {
      const bulletText = content.trim().replace(/^[\*\-]\s*/, "");
      return (
        <li key={index} className="ml-4 list-disc pl-1 text-xs text-[var(--text-2)]">
          {parseInlineMarkdown(bulletText)}
        </li>
      );
    }

    // Otherwise, normal paragraph line
    if (content.trim() === "") {
      return <div key={index} className="h-2" />;
    }

    return (
      <p key={index} className="text-xs text-[var(--text-2)] leading-relaxed">
        {parseInlineMarkdown(content)}
      </p>
    );
  });
}

export function AiChatComponent() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchChat = async () => {
    try {
      const res = await fetch("/api/ai/chat");
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchChat();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend(textToSend?: string) {
    const query = textToSend || input;
    if (!query.trim() || loading) return;

    const userMessage = { id: "temp-" + Date.now(), role: "USER", content: query.trim() };
    setMessages((prev) => [...prev, userMessage]);
    if (!textToSend) setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
      } else {
        const errData = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: "err-" + Date.now(),
            role: "ASSISTANT",
            content: `⚠️ Fehler: ${errData.error || "Antwort konnte nicht generiert werden."}`,
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: "err-" + Date.now(), role: "ASSISTANT", content: "⚠️ Netzwerkfehler bei der KI-Anfrage." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[75vh] rounded-xl border shadow-sm overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--accent)", color: "var(--bg)" }}>
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-heading text-sm font-bold" style={{ color: "var(--text)" }}>
              Scale Evo KI-Assistent
            </h2>
            <p className="text-[11px]" style={{ color: "var(--text-2)" }}>
              Powered by Gemini 2.0 Flash — Kennt deinen aktuellen CRM-Bestand & Tasks
            </p>
          </div>
        </div>

        <button
          onClick={fetchChat}
          className="p-1.5 rounded-md transition-colors hover:bg-[var(--surface-3)]"
          title="Verlauf aktualisieren"
          style={{ color: "var(--text-2)" }}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Chat Messages Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {initialLoading ? (
          <div className="p-12 text-center text-xs" style={{ color: "var(--text-3)" }}>
            <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-2" style={{ borderColor: "var(--border-2)", borderTopColor: "var(--accent)" }} />
            Chatverlauf wird geladen…
          </div>
        ) : messages.length === 0 ? (
          <div className="p-8 text-center max-w-md mx-auto space-y-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto" style={{ background: "var(--surface-2)", color: "var(--accent)" }}>
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-sm" style={{ color: "var(--text)" }}>Wie kann ich dir heute helfen?</h3>
              <p className="text-xs mt-1" style={{ color: "var(--text-2)" }}>
                Frage mich nach Strategien für deinen nächsten Cold Call, erstelle Outreach-Nachrichten oder analysiere deine Top-Leads.
              </p>
            </div>

            {/* Quick Prompts */}
            <div className="grid grid-cols-1 gap-2 pt-2 text-left">
              {QUICK_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(prompt)}
                  className="p-3 rounded-lg border text-xs font-medium text-left transition-all hover:border-[var(--accent)]"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                >
                  💡 {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === "USER";
            return (
              <div
                key={msg.id}
                className={cn("flex gap-3 max-w-3xl", isUser ? "ml-auto flex-row-reverse" : "mr-auto")}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    background: isUser ? "var(--surface-3)" : "var(--accent)",
                    color: isUser ? "var(--text)" : "var(--bg)",
                  }}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                <div
                  className="rounded-2xl px-4 py-3 text-xs leading-relaxed border space-y-1"
                  style={{
                    background: isUser ? "var(--surface-2)" : "var(--surface-2)",
                    borderColor: isUser ? "var(--border-2)" : "var(--border)",
                    color: "var(--text)",
                  }}
                >
                  <div className="space-y-1.5">{renderMarkdown(msg.content)}</div>
                </div>
              </div>
            );
          })
        )}

        {loading && (
          <div className="flex gap-3 mr-auto">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--accent)", color: "var(--bg)" }}>
              <Bot className="w-4 h-4" />
            </div>
            <div className="rounded-2xl px-4 py-3 text-xs border flex items-center gap-2" style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-2)" }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Gemini denkt nach…
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick Prompts Bar (when messages exist) */}
      {messages.length > 0 && (
        <div className="px-4 py-2 border-t flex items-center gap-2 overflow-x-auto" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
          {QUICK_PROMPTS.slice(0, 2).map((prompt, i) => (
            <button
              key={i}
              onClick={() => handleSend(prompt)}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0 border transition-colors hover:border-[var(--accent)]"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
            >
              💡 {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Chat Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-4 border-t flex items-center gap-3 shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Stelle eine Frage an deine KI oder erstelle Aktionen..."
          className="flex-1 rounded-lg px-4 py-2.5 text-xs border outline-none transition-colors"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="p-2.5 rounded-lg flex items-center justify-center transition-all disabled:opacity-40"
          style={{ background: "var(--accent)", color: "var(--bg)" }}
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
