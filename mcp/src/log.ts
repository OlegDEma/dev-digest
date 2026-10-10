/** One JSON line to stderr. stdout is reserved for MCP frames. */
export function log(level: 'info' | 'warn' | 'error', msg: string, data?: Record<string, unknown>): void {
  process.stderr.write(`${JSON.stringify({ level, msg, ...data })}\n`);
}
