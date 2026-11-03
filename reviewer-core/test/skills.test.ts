import { describe, it, expect } from 'vitest';
import { formatSkillBlock } from '../src/index.js';

describe('formatSkillBlock', () => {
  it('renders a heading and the trimmed body', () => {
    expect(formatSkillBlock('No any', '\n  Avoid `any`.\n\n')).toBe('### No any\nAvoid `any`.');
  });
});
