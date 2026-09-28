import { pgTable, uuid, text, jsonb, timestamp, doublePrecision, integer, vector, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

// A house rule the extractor proposed and the evidence gate confirmed against the
// file on disk. `status` is three-state (not a boolean): a re-scan replaces only
// `pending` rows, so a decided rule is never re-litigated. See
// specs/04-conventions.md. Both text enums are mirrored into Postgres as CHECK
// constraints in the migration — text({enum}) narrows TypeScript only.
export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    category: text('category', {
      enum: ['naming', 'imports', 'error-handling', 'testing', 'structure', 'typing', 'async', 'styling'],
    })
      .notNull()
      .default('structure'),
    rule: text('rule').notNull(),
    rationale: text('rationale'),
    evidencePath: text('evidence_path'),
    /** 1-based, as CORRECTED by the verifier — not as claimed by the model. */
    evidenceLine: integer('evidence_line'),
    evidenceSnippet: text('evidence_snippet'),
    /** Files matching the rule's probe, counted by ripgrep. null = not measured. */
    occurrences: integer('occurrences'),
    confidence: doublePrecision('confidence'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    createdAt: now(),
  },
  (t) => ({
    repoCreatedIdx: index('conventions_repo_created_idx').on(t.repoId, t.createdAt),
    // text({enum}) narrows TypeScript only — mirror both enums into Postgres so a
    // bad value is rejected by the DB too, the same rule the review columns follow.
    categoryCk: check(
      'conventions_category_ck',
      sql`${t.category} in ('naming','imports','error-handling','testing','structure','typing','async','styling')`,
    ),
    statusCk: check('conventions_status_ck', sql`${t.status} in ('pending','accepted','rejected')`),
  }),
);
