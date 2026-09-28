import { describe, it, expect } from 'vitest';
import { SafeUrlFetcher, isPrivateAddress, filenameFromUrl } from '../src/adapters/fetcher/index.js';

/**
 * Hermetic tests for the Import-from-URL SSRF guard. These never touch the
 * network: literal-IP / localhost / bad-protocol URLs are rejected before any
 * fetch, and the address / filename helpers are pure.
 */

describe('isPrivateAddress', () => {
  it('flags loopback, private, link-local, CGNAT and unspecified addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata endpoint
      '100.64.0.1', // CGNAT
      '0.0.0.0',
      '::1',
      '::',
      'fc00::1',
      'fe80::1',
      '::ffff:127.0.0.1', // IPv4-mapped loopback
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('allows ordinary public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '93.184.216.34', '2606:2800:220:1::']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('treats a non-IP string as unsafe', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true);
  });
});

describe('filenameFromUrl', () => {
  it('keeps a .md / .markdown / .zip basename and defaults to skill.md otherwise', () => {
    expect(filenameFromUrl('https://raw.example.com/a/b/SKILL.md')).toBe('SKILL.md');
    expect(filenameFromUrl('https://example.com/pack.zip')).toBe('pack.zip');
    expect(filenameFromUrl('https://example.com/raw/main/guide')).toBe('skill.md');
    expect(filenameFromUrl('https://example.com/')).toBe('skill.md');
  });
});

describe('SafeUrlFetcher.fetch guards (no network)', () => {
  const fetcher = new SafeUrlFetcher();

  it('rejects non-http(s) protocols', async () => {
    await expect(fetcher.fetch('ftp://example.com/x.md')).rejects.toThrow(/http\(s\)/);
  });

  it('rejects localhost and private IP literals before any request', async () => {
    await expect(fetcher.fetch('http://localhost:3001/x.md')).rejects.toThrow(/not allowed/);
    await expect(fetcher.fetch('http://127.0.0.1:9999/x.md')).rejects.toThrow(/private address/);
    await expect(fetcher.fetch('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/private address/);
    await expect(fetcher.fetch('http://[::1]:9999/x.md')).rejects.toThrow(/private address/);
  });
});
