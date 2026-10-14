import type { DiscoveredDocument, DocumentStatus } from '@devdigest/shared';

/** Outermost folder segment of `path` that is in the bucket set, else null. */
export function docBucketOf(path: string, buckets: readonly string[]): string | null {
  const set = new Set(buckets.map((b) => b.toLowerCase()));
  const segments = path.split('/').slice(0, -1);
  for (const seg of segments) {
    const lower = seg.toLowerCase();
    if (set.has(lower)) return lower;
  }
  return null;
}

export function toDiscovered(
  entry: { path: string; sizeBytes: number },
  bucket: string | null,
  status: DocumentStatus,
  tokens: number | null,
  usedBy: number,
): DiscoveredDocument {
  const i = entry.path.lastIndexOf('/');
  return {
    path: entry.path,
    folder: i === -1 ? '' : entry.path.slice(0, i),
    name: i === -1 ? entry.path : entry.path.slice(i + 1),
    bucket: bucket ?? '',
    size_bytes: entry.sizeBytes,
    status,
    estimated_tokens: tokens,
    used_by_agents: usedBy,
  };
}

/** path → number of DISTINCT agents that attach it directly or via a bound skill. */
export function usedByCounts(rows: ReadonlyArray<{ agentId: string; docs: readonly string[] }>): Map<string, number> {
  const agentsByPath = new Map<string, Set<string>>();
  for (const { agentId, docs } of rows) {
    for (const p of docs) {
      let s = agentsByPath.get(p);
      if (!s) agentsByPath.set(p, (s = new Set()));
      s.add(agentId);
    }
  }
  return new Map([...agentsByPath].map(([p, s]) => [p, s.size]));
}

/** Agent's own list first, then each skill's in binding order; first occurrence wins. */
export function orderContextPaths(
  agentDocs: readonly string[],
  skillDocs: ReadonlyArray<readonly string[]>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of [agentDocs, ...skillDocs]) {
    for (const p of list) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

export interface ResolvedLineInput {
  path: string;
  status: 'injected' | 'skipped';
  reason: string | null;
  tokens: number | null;
}

/** The three Live-log line shapes of spec C5, in resolution order + one summary. */
export function formatContextLogLines(docs: readonly ResolvedLineInput[]): string[] {
  const lines: string[] = [];
  let injected = 0;
  let total = 0;
  for (const d of docs) {
    if (d.status === 'injected') {
      injected += 1;
      total += d.tokens ?? 0;
      lines.push(`project context: "${d.path}" attached (~${d.tokens ?? 0} tokens)`);
    } else {
      lines.push(`project context: skipped "${d.path}" (${d.reason})`);
    }
  }
  lines.push(
    injected > 0
      ? `project context: ${injected} attached — ~${total} tokens added to the prompt`
      : 'project context: none attached',
  );
  return lines;
}
