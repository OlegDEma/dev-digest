import { describe, it, expect, vi } from 'vitest';
import { emitPromptAssembled, type PromptLogCall } from '../src/platform/prompt-log.js';

const tokenizer = { count: (t: string) => Math.ceil(t.length / 4) };
const call: PromptLogCall = {
  feature: 'onboarding',
  provider: 'openrouter',
  model: 'm',
  repoId: 'repo-1',
  callId: 'fixed-call-id',
  sections: [
    { name: 'system', text: 'sys' },
    { name: 'facts', text: 'FACTS-SENTINEL' },
  ],
};

describe('emitPromptAssembled callId', () => {
  it('echoes the caller-minted id in the record and the return value', () => {
    const info = vi.fn();
    const id = emitPromptAssembled({ info, warn: vi.fn() }, 'summary', tokenizer, call);
    expect(id).toBe('fixed-call-id');
    const rec = info.mock.calls[0]![0] as { call_id: string; feature: string };
    expect(rec.call_id).toBe('fixed-call-id');
    expect(rec.feature).toBe('onboarding');
    expect(JSON.stringify(rec)).not.toContain('FACTS-SENTINEL');
  });

  it('maps onboarding sections to registry entries, not other', () => {
    const info = vi.fn();
    emitPromptAssembled({ info, warn: vi.fn() }, 'summary', tokenizer, call);
    const rec = info.mock.calls[0]![0] as { sections: { name: string }[] };
    expect(rec.sections.map((s) => s.name)).toEqual(['system', 'facts']);
  });

  it('mints a fresh id when none is given', () => {
    const info = vi.fn();
    const id = emitPromptAssembled({ info, warn: vi.fn() }, 'summary', tokenizer, { ...call, callId: undefined });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns null and logs nothing when the mode is off', () => {
    const info = vi.fn();
    expect(emitPromptAssembled({ info, warn: vi.fn() }, 'off', tokenizer, call)).toBeNull();
    expect(info).not.toHaveBeenCalled();
  });
});
