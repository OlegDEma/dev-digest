/* SkillBodyEditor — the design's body editor: a `<name>.md` header with the
   unsaved badge and the token count, a line-number gutter, and markdown
   headings tinted. The tint comes from a highlight layer (a <pre> with one
   block per line) under a transparent-text <textarea> with identical metrics;
   lines never wrap (`white-space: pre`, the body scrolls sideways) so the
   gutter always lines up. No editor library. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { approxTokens } from "../../../../../../lib/format";
import { classifyLine, splitLines } from "./helpers";
import { s } from "./styles";

export function SkillBodyEditor({
  value,
  onChange,
  fileName,
  dirty,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Shown in the header, e.g. `pr-quality-rubric.md`. */
  fileName: string;
  /** Shows the "unsaved" badge. */
  dirty?: boolean;
  placeholder?: string;
}) {
  const t = useTranslations("skills");
  const lines = splitLines(value);
  const tokens = approxTokens(value);
  // The textarea's own text is transparent (the layer below shows it), so its
  // native placeholder would be invisible too — draw it in the layer instead.
  const showPlaceholder = value.length === 0 && !!placeholder;
  const layerLines = showPlaceholder ? splitLines(placeholder!) : lines;

  return (
    <div style={s.frame}>
      <div style={s.head}>
        <Icon.FileText size={14} style={s.headIcon} />
        <span className="mono" style={s.fileName}>
          {fileName}
        </span>
        {dirty && <Badge color="var(--text-muted)">{t("config.unsaved")}</Badge>}
        <span className="mono" style={s.tokens} title={t("config.tokensTitle")}>
          {t("config.tokens", { count: tokens })}
        </span>
      </div>
      <div style={s.body}>
        <div style={s.gutter} aria-hidden data-testid="gutter">
          {lines.map((_, i) => (
            <div key={i} style={s.lineNo}>
              {i + 1}
            </div>
          ))}
        </div>
        <div style={s.editArea}>
          <pre aria-hidden style={showPlaceholder ? s.placeholderLayer : s.highlight} data-testid="highlight">
            {layerLines.map((line, i) => (
              <div key={i} style={s.line(showPlaceholder ? "text" : classifyLine(line))} data-line-kind={classifyLine(line)}>
                {line.length > 0 ? line : "\u200b"}
              </div>
            ))}
          </pre>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={fileName}
            spellCheck={false}
            wrap="off"
            style={s.textarea}
          />
        </div>
      </div>
    </div>
  );
}
