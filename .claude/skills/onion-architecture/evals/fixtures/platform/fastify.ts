import type { Container } from './container.js';

declare module 'fastify' {
  interface FastifyInstance {
    container: Container;
  }
}
