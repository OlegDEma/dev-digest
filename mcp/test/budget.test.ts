import { describe, expect, it } from 'vitest';
import { FakeApi } from './fake-api.js';
import { connect } from './helpers.js';

describe('tools/list budget (AC-2)', () => {
  it('stays within the instruction, description and total budgets', async () => {
    const { client } = await connect(new FakeApi());
    const { tools } = await client.listTools();
    const instructions = client.getInstructions() ?? '';
    const total = JSON.stringify(tools).length;
    process.stderr.write(`tools/list size: ${total} chars, instructions: ${instructions.length}\n`);

    expect(instructions.length).toBeLessThanOrEqual(400);
    for (const t of tools) expect((t.description ?? '').length).toBeLessThanOrEqual(250);
    expect(total).toBeLessThanOrEqual(4000);
  });

  it('has no outputSchema and only scalar inputs', async () => {
    const { client } = await connect(new FakeApi());
    const { tools } = await client.listTools();
    const scalar = new Set(['string', 'integer', 'number', 'boolean']);
    for (const t of tools) {
      expect(t.outputSchema).toBeUndefined();
      const props = (t.inputSchema.properties ?? {}) as Record<string, { type?: string; enum?: unknown[] }>;
      for (const [name, p] of Object.entries(props)) {
        const ok = p.enum !== undefined || (p.type !== undefined && scalar.has(p.type));
        expect(ok, `${t.name}.${name} must be a scalar`).toBe(true);
      }
    }
  });
});
