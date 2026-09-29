/* SkillMarkdown — a skill body rendered the way the design's Preview tab
   shows it: real headings, bullet lists, code and quotes. The vendored
   `Markdown` primitive styles only p / strong / code / a (Tailwind's preflight
   flattens the rest), so the preview owns its own component map. */
"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { s } from "./styles";

export function SkillMarkdown({ children }: { children: string }) {
  return (
    <div style={s.root}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 style={s.h1}>{children}</h1>,
          h2: ({ children }) => <h2 style={s.h2}>{children}</h2>,
          h3: ({ children }) => <h3 style={s.h3}>{children}</h3>,
          h4: ({ children }) => <h3 style={s.h3}>{children}</h3>,
          p: ({ children }) => <p style={s.p}>{children}</p>,
          strong: ({ children }) => <strong style={s.strong}>{children}</strong>,
          ul: ({ children }) => <ul style={s.ul}>{children}</ul>,
          ol: ({ children }) => <ol style={s.ol}>{children}</ol>,
          li: ({ children }) => <li style={s.li}>{children}</li>,
          // Fenced blocks arrive as <pre><code>; inline code has no <pre> parent.
          pre: ({ children }) => <pre style={s.pre}>{children}</pre>,
          code: ({ children, className }) =>
            className ? <code className={className}>{children}</code> : <code style={s.code}>{children}</code>,
          blockquote: ({ children }) => <blockquote style={s.blockquote}>{children}</blockquote>,
          hr: () => <hr style={s.hr} />,
          a: ({ children, href }) => (
            <a href={href} style={s.a} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => <table style={s.table}>{children}</table>,
          th: ({ children }) => <th style={{ ...s.cell, fontWeight: 650, color: "var(--text-primary)" }}>{children}</th>,
          td: ({ children }) => <td style={s.cell}>{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
