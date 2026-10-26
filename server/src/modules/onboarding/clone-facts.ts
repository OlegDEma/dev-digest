import type { CloneFiles, OnboardingSkippedFile } from '@devdigest/shared';
import {
  COMPOSE_FILES,
  ENV_EXAMPLE,
  LOCKFILES,
  MANIFESTS_MAX,
  MANIFEST_MAX_BYTES,
  README_CANDIDATES,
} from './constants.js';

export interface ParsedManifest {
  /** '' for the repo root, else the direct child folder name. */
  dir: string;
  /** Repo-relative manifest path. */
  path: string;
  name: string | null;
  scripts: Record<string, string>;
  /** dependencies + devDependencies + peerDependencies names. */
  dependencies: string[];
  /** `.env.example` exists next to this manifest. */
  envExample: boolean;
}

export interface CloneFacts {
  manifests: ParsedManifest[];
  skipped: OnboardingSkippedFile[];
  /** Lockfile-derived package manager; null when no lockfile (caller decides the default). */
  lockfilePm: 'pnpm' | 'yarn' | 'npm' | null;
  composeFile: string | null;
  /** Raw README text (untrusted), not yet token-capped. */
  readme: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function stringMap(v: unknown): Record<string, string> {
  if (!isRecord(v)) return {};
  const out: Record<string, string> = {};
  for (const k of Object.keys(v).sort()) if (typeof v[k] === 'string') out[k] = v[k] as string;
  return out;
}

/**
 * Read the clone's manifests, lockfile / compose / `.env.example` presence and
 * README — through the `CloneFiles` port only. `.env` / `.env.*` are never opened:
 * `.env.example` is probed with `fileExists`, which does not read the file.
 */
export async function gatherCloneFacts(files: CloneFiles, root: string): Promise<CloneFacts> {
  const skipped: OnboardingSkippedFile[] = [];
  const manifests: ParsedManifest[] = [];

  const candidates = ['', ...(await files.listChildDirs(root))];
  let seen = 0;
  for (const dir of candidates) {
    if (seen >= MANIFESTS_MAX) break;
    const path = dir ? `${dir}/package.json` : 'package.json';
    const found = await files.fileExists(root, path);
    if (found === 'missing') continue;
    seen++;
    if (found === 'outside_repo') {
      skipped.push({ path, reason: 'outside_repo' });
      continue;
    }
    const read = await files.readText(root, path, MANIFEST_MAX_BYTES);
    if (read.kind !== 'ok') {
      skipped.push({
        path,
        reason: read.kind === 'too_large' ? 'too_large' : read.kind === 'outside_repo' ? 'outside_repo' : 'unreadable',
      });
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(read.text);
    } catch {
      skipped.push({ path, reason: 'invalid_json' });
      continue;
    }
    if (!isRecord(json)) {
      skipped.push({ path, reason: 'invalid_json' });
      continue;
    }
    const deps = new Set<string>();
    for (const key of ['dependencies', 'devDependencies', 'peerDependencies']) {
      const m = json[key];
      if (isRecord(m)) for (const name of Object.keys(m)) deps.add(name);
    }
    manifests.push({
      dir,
      path,
      name: typeof json.name === 'string' ? json.name : null,
      scripts: stringMap(json.scripts),
      dependencies: [...deps].sort(),
      envExample: (await files.fileExists(root, dir ? `${dir}/${ENV_EXAMPLE}` : ENV_EXAMPLE)) === 'file',
    });
  }

  let lockfilePm: CloneFacts['lockfilePm'] = null;
  for (const [file, pm] of LOCKFILES) {
    if ((await files.fileExists(root, file)) === 'file') {
      lockfilePm = pm;
      break;
    }
  }

  let composeFile: string | null = null;
  for (const f of COMPOSE_FILES) {
    if ((await files.fileExists(root, f)) === 'file') {
      composeFile = f;
      break;
    }
  }

  let readme: string | null = null;
  for (const f of README_CANDIDATES) {
    if ((await files.fileExists(root, f)) !== 'file') continue;
    const r = await files.readText(root, f, MANIFEST_MAX_BYTES);
    if (r.kind === 'ok') readme = r.text;
    break;
  }

  skipped.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { manifests, skipped, lockfilePm, composeFile, readme };
}
