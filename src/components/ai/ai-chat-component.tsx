"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Sparkles, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const QUICK_PROMPTS = [
  "Welche Leads sollte ich diese Woche kontaktieren?",
  "Erstelle mir ein Instagram-DM Script für Friseure ohne Website",
  "Fasse meine aktuellen Leads und offenen Tasks zusammen",
  "Wie reagiere ich auf den Einwand 'Ich habe bereits Stammkunden'?",
];

function parseInlineMarkdown(text: string) {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return <strong key={i} className="font-semibold">{part}</strong>;
    }
    const codeParts = part.split(/`([^`]+)`/g);
    return codeParts.map((codePart, j) => {
      if (j % 2 === 1) {
        return (
          <code key={j} className="px-1 py-0.5 rounded text-[13px] font-mono bg-black/5 dark:bg-white/10">
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
  const lines = text.split("\n");
  return lines.map((line, index) => {
    let content = line;
    const isHeader = content.startsWith("###") || content.startsWith("##") || content.startsWith("#");
    if (isHeader) {
      const headerText = content.replace(/^#+\s*/, "");
      return (
        <h4 key={index} className="font-semibold text-[15px] mt-4 mb-2">
          {parseInlineMarkdown(headerText)}
        </h4>
      );
    }
    const isBullet = content.trim().startsWith("*") || content.trim().startsWith("-");
    if (isBullet) {
      const bulletText = content.trim().replace(/^[\*\-]\s*/, "");
      return (
        <li key={index} className="ml-5 list-disc pl-1 mb-1 text-[15px] leading-relaxed">
          {parseInlineMarkdown(bulletText)}
        </li>
      );
    }
    if (content.trim() === "") {
      return <div key={index} className="h-2" />;
    }
    return (
      <p key={index} className="text-[15px] leading-relaxed mb-2 last:mb-0">
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
            content: `Achtung: Fehler: ${errData.error || "Antwort konnte nicht generiert werden."}`,
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: "err-" + Date.now(), role: "ASSISTANT", content: "Achtung: Netzwerkfehler bei der KI-Anfrage." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[80vh] relative -mx-4 sm:mx-0">
      {/* Header - Apple Style minimal */}
      <div className="flex items-center justify-between px-6 py-4 shrink-0 bg-transparent z-10 relative">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--accent)", color: "var(--bg)" }}>
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              Scale Evo KI
            </h2>
            <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
              Immer für dich da
            </p>
          </div>
        </div>
        <button
          onClick={fetchChat}
          className="p-2 rounded-full transition-opacity hover:opacity-70"
          style={{ color: "var(--accent)" }}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Chat Messages Body */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-32 space-y-6 scroll-smooth">
        {initialLoading ? (
          <div className="pt-20 text-center text-sm" style={{ color: "var(--text-3)" }}>
            Lädt…
          </div>
        ) : messages.length === 0 ? (
          <div className="pt-12 text-center max-w-md mx-auto space-y-6">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto bg-gradient-to-tr from-[var(--accent)] to-purple-500 text-white shadow-lg">
              <Sparkles className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-semibold text-xl tracking-tight" style={{ color: "var(--text)" }}>Wie kann ich helfen?</h3>
            </div>
            <div className="flex flex-col gap-3 pt-4">
              {QUICK_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(prompt)}
                  className="px-5 py-3 rounded-2xl text-[15px] text-center transition-transform active:scale-95"
                  style={{ background: "var(--surface-2)", color: "var(--text)" }}
                >
                  {prompt}
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
                className={cn("flex max-w-[85%] sm:max-w-[75%]", isUser ? "ml-auto" : "mr-auto")}
              >
                <div
                  className={cn(
                    "px-4 py-2.5 text-[15px] shadow-sm",
                    isUser 
                      ? "rounded-2xl rounded-br-sm bg-[var(--accent)] text-white" 
                      : "rounded-2xl rounded-bl-sm bg-[var(--surface-2)] text-[var(--text)]"
                  )}
                >
                  {renderMarkdown(msg.content)}
                </div>
              </div>
            );
          })
        )}

        {loading && (
          <div className="flex max-w-[85%] mr-auto">
             <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-[var(--surface-2)] text-[var(--text-2)] flex items-center gap-2">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
             </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Glass Input Bar */}
      <div className="absolute bottom-0 left-0 right-0 p-4 pt-8 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)] to-transparent pointer-events-none">
        <div className="pointer-events-auto max-w-3xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-end gap-2 p-2 rounded-3xl border shadow-lg bg-[var(--surface)] shadow-md"
            style={{ 
              background: "var(--surface)",
              borderColor: "var(--border)"
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Nachricht..."
              className="flex-1 min-h-[44px] bg-transparent px-4 py-2 text-[15px] outline-none"
              style={{ color: "var(--text)" }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:scale-100"
              style={{ background: "var(--accent)", color: "var(--bg)" }}
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
