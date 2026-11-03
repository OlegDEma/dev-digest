import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import { RunnerError } from './errors.js';

/** Read the single `agents/*.yaml` under `devdigestDir` and validate it. */
export function loadManifest(devdigestDir: string): AgentManifest {
  const agentsDir = path.join(devdigestDir, 'agents');
  let files: string[];
  try {
    files = readdirSync(agentsDir).filter((f) => /\.ya?ml$/.test(f));
  } catch {
    throw new RunnerError(`No agent manifest directory at ${agentsDir}`);
  }
  if (files.length === 0) throw new RunnerError(`No agent manifest (*.yaml) in ${agentsDir}`);
  if (files.length > 1) {
    throw new RunnerError(`Expected exactly one agent manifest in ${agentsDir}, found ${files.length}`);
  }
  const file = path.join(agentsDir, files[0]!);
  let raw: unknown;
  try {
    raw = parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new RunnerError(`Cannot parse ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const res = AgentManifest.safeParse(raw);
  if (!res.success) throw new RunnerError(`Invalid agent manifest ${file}: ${res.error.message}`);
  return res.data;
}
