import { describe, it, expect } from 'vitest';
import { RepoService } from '../src/modules/repos/service.js';
import { INSIGHTS_TOP_N } from '../src/modules/repos/constants.js';

describe('repo insights', () => {
  it('exposes insights on the service', () => {
    expect(typeof RepoService.prototype.insights).toBe('function');
  });

  it('top-N constant is positive', () => {
    expect(INSIGHTS_TOP_N).toBeGreaterThan(0);
  });
});
