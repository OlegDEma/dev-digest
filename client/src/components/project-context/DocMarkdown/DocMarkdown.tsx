/* DocMarkdown — a project document rendered as markdown. Raw HTML is never
   interpreted (no rehype-raw), and only http(s) links are clickable: any other
   href renders as plain text so a `javascript:` link in a document is inert. */
"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SAFE_LINK } from "./constants";
import { s } from "./styles";

export function DocMarkdown({ children }: { children: string }) {
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
          ul: ({ children }) => <ul style={s.ul}>{children}</ul>,
          ol: ({ children }) => <ol style={s.ol}>{children}</ol>,
          li: ({ children }) => <li style={s.li}>{children}</li>,
          pre: ({ children }) => <pre style={s.pre}>{children}</pre>,
          code: ({ children, className }) =>
            className ? <code className={className}>{children}</code> : <code style={s.code}>{children}</code>,
          blockquote: ({ children }) => <blockquote style={s.blockquote}>{children}</blockquote>,
          a: ({ children, href }) =>
            href && SAFE_LINK.test(href) ? (
              <a href={href} style={s.a} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            ) : (
              <span style={s.inertLink}>{children}</span>
            ),
          table: ({ children }) => <table style={s.table}>{children}</table>,
          th: ({ children }) => <th style={{ ...s.cell, fontWeight: 650 }}>{children}</th>,
          td: ({ children }) => <td style={s.cell}>{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
