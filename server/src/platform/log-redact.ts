/**
 * pino `redact` config — a second line of defence against secrets in logged
 * objects. Paths are exact: `*.x` matches one level only, so error shapes are
 * listed explicitly. The primary control remains "never log secrets".
 */
export const LOG_REDACT = {
  paths: [
    'authorization',
    '*.authorization',
    'apiKey',
    '*.apiKey',
    'token',
    '*.token',
    'password',
    '*.password',
    'secret',
    '*.secret',
    // pino's `err` serializer copies enumerable props of SDK/HTTP errors.
    'err.details.raw',
    'err.request.headers.authorization',
    'err.request.headers.Authorization',
    'err.config.headers.Authorization',
    'err.config.headers.authorization',
    'err.response.config.headers.Authorization',
    'err.response.config.headers.authorization',
    'err.headers.authorization',
    'err.headers.Authorization',
    // Defence only: Fastify's default `req` serializer does not log headers today.
    'req.headers.authorization',
    'req.headers.cookie',
  ],
  censor: '[redacted]',
};
