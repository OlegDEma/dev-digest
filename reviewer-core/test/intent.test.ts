import { describe, it, expect } from 'vitest';
import type { Intent, UnifiedDiff } from '@devdigest/shared';
import { MockLLMProvider } from '../../server/src/adapters/mocks.js';
import {
  adjustIntent,
  buildIntentMessages,
  classifyIntent,
  renderFileList,
  truncateForIntent,
  type IntentSourceInput,
} from '../src/index.js';

const diff: UnifiedDiff = {
  raw: 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,3 @@ function foo()\n keep\n-old secret line\n+new secret line\n',
  files: [
    {
      path: 'src/a.ts',
      additions: 1,
      deletions: 1,
      hunks: [
        {
          file: 'src/a.ts',
          oldStart: 1,
          oldLines: 2,
          newStart: 1,
          newLines: 3,
          newLineNumbers: [1, 2, 3],
          heading: 'function foo()',
        },
      ],
    },
  ],
};

const base: Intent = {
  summary: 's',
  in_scope: ['a'],
  out_of_scope: [],
  risk_areas: [],
  missing_context: [],
  confidence: 'high',
};

describe('renderFileList', () => {
  it('emits paths, counts and hunk headers with headings, and no body lines', () => {
    const text = renderFileList(diff);
    expect(text).toContain('src/a.ts (+1/-1)');
    expect(text).toContain('@@ -1,2 +1,3 @@ function foo()');
    expect(text).not.toContain('secret');
    for (const line of text.split('\n')) expect(line).not.toMatch(/^[+\- ]/);
  });
});

describe('buildIntentMessages', () => {
  const sources: IntentSourceInput[] = [
    { kind: 'issue', ref: '#1', status: 'used', reason: null, text: 'issue text' },
    { kind: 'repo_doc', ref: 'specs/x.md', status: 'used', reason: null, text: 'doc text' },
    { kind: 'url', ref: 'https://x.test/p', status: 'unresolved', reason: 'HTTP 404', text: '' },
  ];
  const { messages, sections } = buildIntentMessages({
    title: 'T',
    body: 'B',
    sources,
    fileList: renderFileList(diff),
  });

  it('wraps every author-controlled source as untrusted and lists unresolved refs', () => {
    const user = messages[1]!.content;
    for (const label of ['pr-title', 'pr-body', 'issue:#1', 'repo_doc:specs/x.md', 'file-list']) {
      expect(user).toContain(`<untrusted source="${label}">`);
    }
    expect(user).toContain('https://x.test/p (HTTP 404)');
    expect(sections.map((s) => s.name)).toEqual([
      'system', 'title', 'body', 'issues', 'docs', 'unresolved', 'file_list',
    ]);
  });

  it('contains no diff body line', () => {
    expect(messages.map((m) => m.content).join('\n')).not.toContain('secret');
  });
});

describe('adjustIntent', () => {
  it('empty body forces low', () => {
    expect(adjustIntent(base, { bodyEmpty: true, unresolved: [] }).confidence).toBe('low');
  });
  it('unresolved caps at medium and appends missing refs once', () => {
    const out = adjustIntent(
      { ...base, missing_context: ['see https://a.test'] },
      { bodyEmpty: false, unresolved: ['https://a.test', '#7'] },
    );
    expect(out.confidence).toBe('medium');
    expect(out.missing_context).toEqual(['see https://a.test', '#7']);
  });
  it('leaves a clean intent untouched', () => {
    expect(adjustIntent(base, { bodyEmpty: false, unresolved: [] })).toEqual(base);
  });
});

describe('classifyIntent', () => {
  it('passes requireParameters + schemaName PrIntent and applies guards', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { PrIntent: base } });
    const res = await classifyIntent({
      llm,
      model: 'm',
      title: 'T',
      body: '',
      sources: [],
      diff,
      requireParameters: true,
      sessionId: 'o/r#1:intent',
    });
    const req = llm.calls[0]!.req as Record<string, unknown>;
    expect(req.schemaName).toBe('PrIntent');
    expect(req.requireParameters).toBe(true);
    expect(req.temperature).toBeUndefined();
    expect(req.maxTokens).toBe(4000);
    expect(req.sessionId).toBe('o/r#1:intent');
    expect(res.intent.confidence).toBe('low');
  });
});

describe('truncateForIntent', () => {
  it('marks a cut so the model does not read it as an unfinished document', () => {
    const out = truncateForIntent('a'.repeat(50), 10);
    expect(out).toBe(`${'a'.repeat(10)}\n[truncated by DevDigest: showing the first 10 of 50 characters]`);
  });
  it('leaves short text alone and is idempotent on already-truncated text', () => {
    expect(truncateForIntent('short', 10)).toBe('short');
    const once = truncateForIntent('b'.repeat(50), 10);
    expect(truncateForIntent(once, 10)).toBe(once);
  });
});
