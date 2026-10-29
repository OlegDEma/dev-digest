import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

export type Db = PostgresJsDatabase<typeof schema>;

export function createDb(url: string): Db {
  return drizzle(postgres(url), { schema });
}
