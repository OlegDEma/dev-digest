/* ArchitectureBody — the Architecture overview: markdown prose (no raw HTML,
   only http(s) links clickable) and the Mermaid diagram, which is dropped with
   a note when it is not valid Mermaid. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { DocMarkdown } from "../../../../../../components/project-context/DocMarkdown";
import { MermaidDiagram } from "../../../../../../components/mermaid-diagram";
import { s } from "./styles";

export function ArchitectureBody({ body, diagram }: { body: string | null; diagram: string | null }) {
  const t = useTranslations("onboarding");

  return (
    <div>
      {body && <DocMarkdown>{body}</DocMarkdown>}
      {diagram && <Diagram key={diagram} diagram={diagram} note={t("architecture.diagramInvalid")} />}
    </div>
  );
}

/** Keyed by the diagram source, so a new diagram starts with fresh `invalid` state. */
function Diagram({ diagram, note }: { diagram: string; note: string }) {
  const [invalid, setInvalid] = React.useState(false);
  const onInvalid = React.useCallback(() => setInvalid(true), []);
  return (
    <div style={s.diagram}>
      <MermaidDiagram chart={diagram} onInvalid={onInvalid} />
      {invalid && <p style={s.note}>{note}</p>}
    </div>
  );
}
