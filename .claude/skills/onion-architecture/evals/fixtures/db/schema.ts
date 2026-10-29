import { boolean, doublePrecision, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const now = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const repos = pgTable('repos', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  owner: text('owner').notNull(),
  name: text('name').notNull(),
  createdAt: now(),
});

export const pullRequests = pgTable('pull_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id').notNull().references(() => repos.id),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  prId: uuid('pr_id').notNull().references(() => pullRequests.id),
  createdAt: now(),
});

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id').notNull().references(() => reviews.id),
  severity: text('severity').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
});

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  prId: uuid('pr_id').notNull().references(() => pullRequests.id),
  status: text('status').notNull(),
  costUsd: doublePrecision('cost_usd'),
  findingsBySeverity: jsonb('findings_by_severity').$type<Record<string, number>>(),
  error: text('error'),
  createdAt: now(),
});

export const notificationRules = pgTable('notification_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  repoId: uuid('repo_id').notNull().references(() => repos.id),
  createdBy: uuid('created_by').notNull(),
  minSeverity: text('min_severity').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: now(),
});

export const weeklyDigests = pgTable('weekly_digests', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  repoId: uuid('repo_id').notNull().references(() => repos.id),
  fromDate: timestamp('from_date', { withTimezone: true }).notNull(),
  toDate: timestamp('to_date', { withTimezone: true }).notNull(),
  summary: text('summary').notNull(),
  health: text('health').notNull(),
  costUsd: doublePrecision('cost_usd').notNull(),
  createdAt: now(),
});

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  kind: text('kind').notNull(),
  payload: jsonb('payload').$type<object>().notNull(),
  status: text('status').notNull(),
  attempts: integer('attempts').notNull().default(0),
  error: text('error'),
  createdAt: now(),
});
