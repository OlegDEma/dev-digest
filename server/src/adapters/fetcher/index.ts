/**
 * URL fetcher port — the seam the skills module uses to pull a remote skill
 * document (Import from URL). A port so the service never does raw network I/O
 * itself and tests inject a fake (mirrors the depgraph / tokenizer adapters).
 */

export interface FetchedDocument {
  /** Raw response bytes (markdown or a .zip), already size-capped. */
  bytes: Uint8Array;
  /** File name derived from the final URL (`…/SKILL.md` → `SKILL.md`), for the parser. */
  filename: string;
}

export interface UrlFetcher {
  /**
   * Fetch a remote document with SSRF guards (http(s) only, no private/loopback
   * hosts, capped size / time / redirects). Throws `ValidationError` (422) on any
   * guard violation or transport failure.
   */
  fetch(url: string): Promise<FetchedDocument>;
}

export { SafeUrlFetcher } from './safe-fetch.js';
export { isPrivateAddress, filenameFromUrl } from './safe-fetch.js';
