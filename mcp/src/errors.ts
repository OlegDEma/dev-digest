import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as T from './texts.js';

/** An HTTP or network failure from the DevDigest API. `status: null` = unreachable. */
export class ApiError extends Error {
  constructor(
    public readonly status: number | null,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** A failure whose model-visible text is already final (§7b). */
export class ToolFailure extends Error {
  constructor(public readonly text: string) {
    super(text);
    this.name = 'ToolFailure';
  }
}

export function errorResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

export function toToolError(err: unknown, apiUrl: string): CallToolResult {
  if (err instanceof ToolFailure) return errorResult(err.text);
  if (err instanceof ApiError) {
    if (err.status === null) return errorResult(T.unreachable(apiUrl));
    if (err.status === 429) return errorResult(T.RATE_LIMITED);
    return errorResult(T.apiError(err.status, err.code, err.message));
  }
  const message = err instanceof Error ? err.message : String(err);
  return errorResult(T.apiError(500, 'internal', message));
}
