import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSection = z.object({
  kind: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
});
export type Onboarding = z.infer<typeof Onboarding>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum(['manual', 'imported_url', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
});
export type Skill = z.infer<typeof Skill>;

/**
 * A skill as listed on the /skills rail: the row plus how many agents bind it
 * (`agent_skills` rows per skill) and its 30-day rates (specs/03-skills.md
 * §10.3). Computed on read, not stored; a rate is null when it has no
 * denominator (no runs / nothing acted on) — render it as "—", never 0.
 */
export const SkillSummary = Skill.extend({
  used_by: z.number().int(),
  /** % of the workspace's done runs (30d) whose prompt carried this skill. */
  pull_pct: z.number().nullable(),
  /** accepted ÷ (accepted + dismissed) over findings of runs with this skill (30d), in %. */
  accept_pct: z.number().nullable(),
});
export type SkillSummary = z.infer<typeof SkillSummary>;

/** One agent binding a skill, as the Stats tab lists them. */
export const SkillStatsAgent = z.object({ id: z.string(), name: z.string() });
export type SkillStatsAgent = z.infer<typeof SkillStatsAgent>;

/**
 * The Stats tab (`GET /skills/:id/stats`): real numbers over the last 30 days,
 * attributed through `agent_run_skills` — a run "includes" a skill when the skill
 * was in its prompt; its findings count for every skill it included.
 */
export const SkillStats = z.object({
  used_by: z.number().int(),
  runs_30d: z.number().int(),
  runs_with_skill_30d: z.number().int(),
  pull_pct: z.number().nullable(),
  findings_30d: z.number().int(),
  accepted_30d: z.number().int(),
  dismissed_30d: z.number().int(),
  accept_pct: z.number().nullable(),
  agents: z.array(SkillStatsAgent),
});
export type SkillStats = z.infer<typeof SkillStats>;

/**
 * The result of `POST /skills/import`: the skill CORE extracted from an uploaded
 * `.md` file or `.zip` archive. A preview only — nothing is persisted until the
 * user confirms and the client POSTs it as a regular skill. Every archive member
 * that is not the core is listed under `ignored_entries` (it is neither written
 * to disk nor executed); executable-looking members also produce a warning.
 */
export const SkillImportPreview = z.object({
  filename: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  source: SkillSource,
  /** The archive member (or the file itself) that became the skill body. */
  core_entry: z.string(),
  ignored_entries: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;

/** One immutable body snapshot from `skill_versions` (written on each config edit). */
export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions ----
// A house rule the extractor proposed and CODE verified. The model only ever
// proposes; `evidence_*` is what the verifier confirmed against the file on disk,
// never what the model claimed (see specs/04-conventions.md §5.3).
export const ConventionCategory = z.enum([
  'naming',
  'imports',
  'error-handling',
  'testing',
  'structure',
  'typing',
  'async',
  'styling',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

// Triage is three-state, not a boolean: a re-scan replaces only `pending` rows, so
// a rule the user already decided on is never re-litigated.
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

export const ConventionCandidate = z.object({
  id: z.string(),
  repo_id: z.string().nullish(),
  category: ConventionCategory,
  rule: z.string(),
  rationale: z.string().nullish(),
  evidence_path: z.string(),
  /** 1-based, as corrected by the verifier — not as claimed by the model. */
  evidence_line: z.number().int().nullish(),
  evidence_snippet: z.string(),
  /** Files matching the rule's probe, counted by ripgrep. null = not measured. */
  occurrences: z.number().int().nullish(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  created_at: z.string(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

// Counters make a strict gate legible: "3 of 12 kept" reads as the gate working,
// not as the feature being broken.
export const ConventionExtractResult = z.object({
  candidates: z.array(ConventionCandidate),
  proposed: z.number().int(),
  dropped_ungrounded: z.number().int(),
  dropped_duplicate: z.number().int(),
  sampled_files: z.number().int(),
  model: z.string(),
  cost_usd: z.number().nullish(),
});
export type ConventionExtractResult = z.infer<typeof ConventionExtractResult>;

// An UNPERSISTED skill assembled from the accepted candidates. The user edits it
// in the modal and only then POSTs /skills — same preview-then-confirm flow as
// skill import.
export const ConventionSkillDraft = z.object({
  name: z.string(),
  description: z.string(),
  type: z.string(),
  body: z.string(),
  evidence_files: z.array(z.string()),
});
export type ConventionSkillDraft = z.infer<typeof ConventionSkillDraft>;

// ---- Agents ----
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a CI review should BLOCK (REQUEST_CHANGES + fail the
// check) vs just comment. Deterministic from severities; acted on ONLY in CI.
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
  // Number of skills bound to this agent (`agent_skills` rows). Decorated on the
  // list endpoint only — single-agent reads and mutations omit it.
  skill_count: z.number().int().optional(),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;
