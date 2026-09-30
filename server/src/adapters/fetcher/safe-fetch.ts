import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { ValidationError } from '../../platform/errors.js';
import { MAX_UPLOAD_BYTES } from '../../modules/skills/constants.js';
import type { FetchedDocument, UrlFetcher } from './index.js';

/**
 * A `UrlFetcher` that fetches remote skill documents defensively. Every request
 * is an SSRF hazard (the URL comes from the user), so this:
 *   - allows only http(s);
 *   - resolves the host and refuses any private / loopback / link-local address,
 *     re-checking on every redirect hop (a public host must not bounce inward);
 *   - caps redirects, wall-clock time, and the number of bytes read.
 * Nothing here is written to disk or executed — bytes are handed to the pure
 * import parser, exactly like an uploaded file.
 */

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;

export class SafeUrlFetcher implements UrlFetcher {
  async fetch(rawUrl: string): Promise<FetchedDocument> {
    let current = rawUrl;
    for (let hop = 0; ; hop++) {
      await assertPublicUrl(current);

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(current, {
          redirect: 'manual',
          signal: ac.signal,
          headers: {
            'user-agent': 'DevDigest-SkillImport',
            accept: 'text/markdown, text/plain, application/zip;q=0.9, */*;q=0.5',
          },
        });
      } catch (err) {
        throw new ValidationError('Could not fetch the URL', { reason: (err as Error).message });
      } finally {
        clearTimeout(timer);
      }

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) throw new ValidationError(`Fetch failed (HTTP ${res.status} with no redirect target)`);
        if (hop >= MAX_REDIRECTS) throw new ValidationError('Too many redirects');
        current = new URL(loc, current).toString();
        continue;
      }
      if (!res.ok) throw new ValidationError(`Fetch failed (HTTP ${res.status})`);

      const declared = Number(res.headers.get('content-length') ?? '');
      if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
        throw new ValidationError(`Remote file is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024)} KB`);
      }
      const bytes = await readCapped(res, MAX_UPLOAD_BYTES);
      return { bytes, filename: filenameFromUrl(current) };
    }
  }
}

/** Reject a URL that is not http(s) or that resolves to a non-public address. */
async function assertPublicUrl(rawUrl: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new ValidationError('Invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new ValidationError('Only http(s) URLs can be imported');
  }
  const host = u.hostname.replace(/^\[|\]$/g, ''); // unwrap [::1]-style literals
  if (host.toLowerCase() === 'localhost') {
    throw new ValidationError('That host is not allowed');
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new ValidationError('URL points to a private address');
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new ValidationError('Could not resolve the host');
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new ValidationError('URL resolves to a private address');
  }
}

/** True for loopback / private / link-local / ULA / unspecified addresses. */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateV4(ip);
  if (version === 6) return isPrivateV6(ip);
  return true; // not a literal IP → treat as unsafe
}

function isPrivateV4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateV6(ip: string): boolean {
  const x = ip.toLowerCase();
  if (x === '::1' || x === '::') return true; // loopback, unspecified
  const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return isPrivateV4(mapped[1]!);
  // WHATWG URL serialises `[::ffff:127.0.0.1]` as hex `::ffff:7f00:1` — decode
  // the embedded IPv4 (mapped `::ffff:` and deprecated compatible `::` forms).
  const hex = x.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (/^f[cd]/.test(x)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(x)) return true; // fe80::/10 link-local
  return false;
}

/** Read a response body, aborting past `cap` bytes (for servers that omit Content-Length). */
async function readCapped(res: Response, cap: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > cap) throw new ValidationError(`Remote file is larger than ${Math.round(cap / 1024)} KB`);
    return buf;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > cap) {
      await reader.cancel();
      throw new ValidationError(`Remote file is larger than ${Math.round(cap / 1024)} KB`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** Derive a parser-friendly filename from the final URL; default to markdown. */
export function filenameFromUrl(rawUrl: string): string {
  try {
    const base = new URL(rawUrl).pathname.split('/').filter(Boolean).pop() ?? '';
    if (base && /\.(md|markdown|zip)$/i.test(base)) return decodeURIComponent(base);
  } catch {
    /* fall through to the default */
  }
  return 'skill.md';
}
