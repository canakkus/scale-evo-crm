"use client";

import React, { useMemo } from "react";

type MarkdownContentProps = {
  content: string;
  className?: string;
};

// Helper: Parse inline markdown (bold, code, italic, placeholders like [Dein Name])
function renderInline(text: string): React.ReactNode {
  if (!text) return null;

  // Split on bold (**text**)
  const boldParts = text.split(/\*\*([^*]+)\*\*/g);

  return boldParts.map((boldPart, bIdx) => {
    if (bIdx % 2 === 1) {
      return (
        <strong key={`b-${bIdx}`} className="font-bold text-[var(--text)]">
          {renderInlineHelper(boldPart)}
        </strong>
      );
    }
    return renderInlineHelper(boldPart, `norm-${bIdx}`);
  });
}

function renderInlineHelper(text: string, keyPrefix: string = "k"): React.ReactNode {
  // Split on code (`code`)
  const codeParts = text.split(/`([^`]+)`/g);

  return codeParts.map((codePart, cIdx) => {
    if (cIdx % 2 === 1) {
      return (
        <code
          key={`${keyPrefix}-c-${cIdx}`}
          className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-black/5 dark:bg-white/10 text-orange-600 dark:text-orange-400 border border-black/10 dark:border-white/10"
        >
          {codePart}
        </code>
      );
    }

    // Split on placeholders like [Dein Name] or [Name]
    const placeholderParts = codePart.split(/(\[[A-Za-zÄÖÜäöüß\s\-_/]+\])/g);
    return placeholderParts.map((pPart, pIdx) => {
      if (pIdx % 2 === 1 && pPart.startsWith("[") && pPart.endsWith("]")) {
        return (
          <span
            key={`${keyPrefix}-p-${cIdx}-${pIdx}`}
            className="inline-block px-1.5 py-0.2 mx-0.5 rounded font-mono text-[11px] font-semibold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30"
          >
            {pPart}
          </span>
        );
      }

      // Split on italic (*italic*)
      const italicParts = pPart.split(/\*([^*]+)\*/g);
      return italicParts.map((iPart, iIdx) => {
        if (iIdx % 2 === 1) {
          return (
            <em key={`${keyPrefix}-i-${cIdx}-${pIdx}-${iIdx}`} className="italic opacity-90">
              {iPart}
            </em>
          );
        }
        return <React.Fragment key={`${keyPrefix}-t-${cIdx}-${pIdx}-${iIdx}`}>{iPart}</React.Fragment>;
      });
    });
  });
}

type ParsedBlock =
  | { type: "h1"; content: string }
  | { type: "h2"; content: string }
  | { type: "h3"; content: string }
  | { type: "hr" }
  | { type: "blockquote"; content: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "code"; code: string; language?: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; content: string };

function parseMarkdownBlocks(text: string): ParsedBlock[] {
  const lines = text.split("\n");
  const blocks: ParsedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 1. Code blocks (```)
    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({
        type: "code",
        code: codeLines.join("\n"),
        language: language || undefined,
      });
      continue;
    }

    // 2. Horizontal rules (--- or *** or ___ at least 3)
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // 3. Tables (starts with |)
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        // parse headers
        const headerCells = tableLines[0]
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());

        // Check if line 1 is separator (e.g. |---|---|)
        const isSeparator = /^\|?(\s*:?-+:?\s*\|?)+$/.test(tableLines[1]);
        const startRowIndex = isSeparator ? 2 : 1;

        const bodyRows: string[][] = [];
        for (let r = startRowIndex; r < tableLines.length; r++) {
          const cells = tableLines[r]
            .split("|")
            .slice(1, -1)
            .map((c) => c.trim());
          bodyRows.push(cells);
        }

        blocks.push({
          type: "table",
          headers: headerCells,
          rows: bodyRows,
        });
        continue;
      }
    }

    // 4. Headers (#, ##, ###)
    if (trimmed.startsWith("### ")) {
      blocks.push({ type: "h3", content: trimmed.slice(4).trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      blocks.push({ type: "h2", content: trimmed.slice(3).trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      blocks.push({ type: "h1", content: trimmed.slice(2).trim() });
      i++;
      continue;
    }

    // 5. Blockquotes (> ...)
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "blockquote", content: quoteLines.join("\n") });
      continue;
    }

    // 6. Lists (- or * or numbered 1.)
    if (/^(\-|\*|\d+\.)\s+/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^(\-|\*|\d+\.)\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^(\-|\*|\d+\.)\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", items: listItems });
      continue;
    }

    // 7. Empty lines
    if (trimmed === "") {
      i++;
      continue;
    }

    // 8. Paragraph (accumulate continuous text lines)
    const paraLines: string[] = [rawLine];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("#") &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith(">") &&
      !lines[i].trim().startsWith("|") &&
      !/^(\-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
      !/^(\-|\*|\d+\.)\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    blocks.push({ type: "paragraph", content: paraLines.join("\n") });
  }

  return blocks;
}

export function MarkdownContent({ content, className = "" }: MarkdownContentProps) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);

  return (
    <div className={`space-y-2.5 text-xs ${className}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case "h1":
            return (
              <div
                key={idx}
                className="mt-3.5 mb-2 pb-1.5 border-b border-[var(--border)] text-sm font-bold text-[var(--text)] flex items-center gap-1.5"
              >
                {renderInline(block.content)}
              </div>
            );

          case "h2":
            return (
              <div
                key={idx}
                className="mt-3 mb-1 text-xs font-bold text-[var(--text)] flex items-center gap-1.5"
              >
                {renderInline(block.content)}
              </div>
            );

          case "h3":
            return (
              <div key={idx} className="mt-2.5 mb-1 flex items-center">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-md bg-[var(--surface-3)] text-[var(--accent)] border border-[var(--border)]">
                  {renderInline(block.content)}
                </span>
              </div>
            );

          case "hr":
            return (
              <hr
                key={idx}
                className="my-3 border-0 h-px bg-[var(--border)] opacity-70"
              />
            );

          case "blockquote":
            return (
              <div
                key={idx}
                className="my-2 pl-3 py-1.5 border-l-2 border-amber-500/80 bg-amber-500/10 rounded-r-xl text-xs text-[var(--text)]"
              >
                {renderInline(block.content)}
              </div>
            );

          case "table":
            return (
              <div
                key={idx}
                className="my-2.5 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xs"
              >
                <table className="w-full text-left text-xs border-collapse">
                  {block.headers.length > 0 && (
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--surface-3)]">
                        {block.headers.map((h, hIdx) => (
                          <th
                            key={hIdx}
                            className="px-3 py-2 font-semibold text-[var(--text)] text-[11px] whitespace-nowrap"
                          >
                            {renderInline(h)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody className="divide-y divide-[var(--border)]">
                    {block.rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className="hover:bg-[var(--surface-2)] transition-colors"
                      >
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="px-3 py-2 text-[var(--text-2)] align-top text-xs leading-relaxed"
                          >
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case "code":
            return (
              <div
                key={idx}
                className="my-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-xs"
              >
                <div className="px-3 py-1 border-b border-[var(--border)] bg-[var(--surface-3)] text-[10px] font-mono text-[var(--text-3)] flex items-center justify-between">
                  <span>{block.language || "Ablauf / Leitfaden"}</span>
                </div>
                <pre className="p-3 text-xs font-mono text-[var(--text)] whitespace-pre-wrap leading-relaxed overflow-x-auto">
                  {block.code}
                </pre>
              </div>
            );

          case "list":
            return (
              <ul key={idx} className="my-1.5 space-y-1">
                {block.items.map((item, itemIdx) => (
                  <li
                    key={itemIdx}
                    className="flex items-start gap-2 text-xs text-[var(--text)] leading-relaxed"
                  >
                    <span className="text-[var(--accent)] font-bold mt-0.5">•</span>
                    <span className="flex-1">{renderInline(item)}</span>
                  </li>
                ))}
              </ul>
            );

          case "paragraph":
            return (
              <p
                key={idx}
                className="text-xs text-[var(--text)] leading-relaxed whitespace-pre-wrap"
              >
                {renderInline(block.content)}
              </p>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
