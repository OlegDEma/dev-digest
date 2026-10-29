import { readFileSync } from 'node:fs';
import path from 'node:path';
import { formatSkillBlock } from '@devdigest/reviewer-core';
import { RunnerError } from './errors.js';

/** Resolve each manifest skill slug to its `skills/<slug>.md` body, in manifest order. */
export function loadSkillBlocks(devdigestDir: string, slugs: string[]): string[] {
  return slugs.map((slug) => {
    // A slug is a file stem, never a path.
    if (!/^[\w.-]+$/.test(slug) || slug.includes('..')) {
      throw new RunnerError(`Invalid skill slug "${slug}"`);
    }
    const file = path.join(devdigestDir, 'skills', `${slug}.md`);
    try {
      // The manifest carries only slugs, so the header is the slug (`### security-rules`);
      // studio and eval runs use the skill name (`### Security Rules`). See README.
      return formatSkillBlock(slug, readFileSync(file, 'utf8'));
    } catch {
      throw new RunnerError(`Skill file not found for "${slug}": ${file}`);
    }
  });
}
