import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { and, eq, gte } from 'drizzle-orm';
import type { Finding, Severity } from '../../contracts/findings.js';
import { createDb } from '../../db/client.js';
import * as t from '../../db/schema.js';

export interface CalibrationConfig {
  dismissRateDowngrade: number;
  minSamples: number;
  lookbackDays: number;
  model: string;
}

export interface CalibrationInput {
  repoId: string;
  findings: Finding[];
}

export interface CalibratedFinding extends Finding {
  original_severity: Severity;
  calibration_note?: string;
}

const DOWNGRADE: Record<Severity, Severity> = {
  CRITICAL: 'WARNING',
  WARNING: 'SUGGESTION',
  SUGGESTION: 'SUGGESTION',
};

const db = createDb(process.env.DATABASE_URL ?? '');

function loadConfig(): CalibrationConfig {
  const raw = readFileSync(join(process.cwd(), 'calibration.config.json'), 'utf8');
  return JSON.parse(raw) as CalibrationConfig;
}

export function dismissRate(dismissed: number, total: number): number {
  if (total === 0) return 0;
  return dismissed / total;
}

export function downgrade(severity: Severity): Severity {
  return DOWNGRADE[severity];
}

async function historicalDismissRates(
  repoId: string,
  lookbackDays: number,
): Promise<Map<string, { dismissed: number; total: number }>> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ category: t.findings.category, dismissedAt: t.findings.dismissedAt })
    .from(t.findings)
    .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.reviews.prId))
    .where(and(eq(t.pullRequests.repoId, repoId), gte(t.reviews.createdAt, since)));

  const stats = new Map<string, { dismissed: number; total: number }>();
  for (const r of rows) {
    const s = stats.get(r.category) ?? { dismissed: 0, total: 0 };
    s.total += 1;
    if (r.dismissedAt) s.dismissed += 1;
    stats.set(r.category, s);
  }
  return stats;
}

async function explain(finding: Finding, rate: number, model: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model,
    max_tokens: 120,
    messages: [
      {
        role: 'user',
        content:
          `In one sentence, explain to a reviewer why the finding "${finding.title}" ` +
          `was downgraded: reviewers dismissed ${(rate * 100).toFixed(0)}% of similar findings.`,
      },
    ],
  });
  const block = res.content[0];
  return block && block.type === 'text' ? block.text : '';
}

export async function calibrateFindings(input: CalibrationInput): Promise<CalibratedFinding[]> {
  const config = loadConfig();
  const stats = await historicalDismissRates(input.repoId, config.lookbackDays);

  const out: CalibratedFinding[] = [];
  for (const f of input.findings) {
    const s = stats.get(f.category);
    const rate = s ? dismissRate(s.dismissed, s.total) : 0;
    if (s && s.total >= config.minSamples && rate >= config.dismissRateDowngrade) {
      out.push({
        ...f,
        severity: downgrade(f.severity),
        original_severity: f.severity,
        calibration_note: await explain(f, rate, config.model),
      });
    } else {
      out.push({ ...f, original_severity: f.severity });
    }
  }
  return out;
}
