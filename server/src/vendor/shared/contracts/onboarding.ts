import { z } from 'zod';

/**
 * Onboarding Tour — C1 (read/generate response) and its parts. All fields and
 * enum values are lowercase snake_case.
 */

export const OnboardingSkeletonReason = z.enum([
  'no_clone',
  'index_unavailable',
  'no_import_graph',
  'llm_not_configured',
  'llm_failed',
  'llm_invalid_output',
  'llm_timeout',
]);
export type OnboardingSkeletonReason = z.infer<typeof OnboardingSkeletonReason>;

export const OnboardingPartialReason = z.enum([
  'index_partial',
  'index_capped',
  'files_skipped',
  'facts_truncated',
]);
export type OnboardingPartialReason = z.infer<typeof OnboardingPartialReason>;

export const OnboardingSectionKind = z.enum([
  'architecture_overview',
  'critical_paths',
  'run_locally',
  'reading_path',
  'first_tasks',
]);
export type OnboardingSectionKind = z.infer<typeof OnboardingSectionKind>;

export const OnboardingProvenance = z.enum(['from_index', 'ai_written']);
export type OnboardingProvenance = z.infer<typeof OnboardingProvenance>;

export const OnboardingIndexSummary = z.object({
  status: z.enum(['full', 'partial', 'degraded', 'failed']),
  files_indexed: z.number().int().min(0),
  source_files_total: z.number().int().min(0).nullable(),
  files_bounded: z.number().int().min(0).nullable(),
  files_skipped: z.number().int().min(0),
  last_indexed_sha: z.string().nullable(),
  hotness_available: z.boolean(),
  clone_available: z.boolean(),
});
export type OnboardingIndexSummary = z.infer<typeof OnboardingIndexSummary>;

export const OnboardingLlmUsage = z.object({
  calls: z.union([z.literal(0), z.literal(1)]),
  call_id: z.string().nullable(),
  attempts: z.number().int().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type OnboardingLlmUsage = z.infer<typeof OnboardingLlmUsage>;

export const OnboardingSkippedFile = z.object({
  path: z.string(),
  reason: z.enum(['too_large', 'invalid_json', 'unreadable', 'outside_repo']),
});
export type OnboardingSkippedFile = z.infer<typeof OnboardingSkippedFile>;

const Percentile = z.number().int().min(0).max(100);

export const OnboardingCriticalPathItem = z.object({
  path: z.string(),
  description: z.string(),
  description_provenance: OnboardingProvenance,
  importers: z.number().int().min(0),
  endpoints: z.number().int().min(0),
  rank_percentile: Percentile,
});
export type OnboardingCriticalPathItem = z.infer<typeof OnboardingCriticalPathItem>;

export const OnboardingRunCommandItem = z.object({
  order: z.number().int().min(1),
  command: z.string(),
  annotation: z.string().nullable(),
  source_path: z.string(),
});
export type OnboardingRunCommandItem = z.infer<typeof OnboardingRunCommandItem>;

export const OnboardingReadingPathItem = z.object({
  order: z.number().int().min(1),
  path: z.string(),
  reason: z.string(),
  reason_provenance: OnboardingProvenance,
  rank_percentile: Percentile,
  score: z.number(),
});
export type OnboardingReadingPathItem = z.infer<typeof OnboardingReadingPathItem>;

export const OnboardingFirstTaskItem = z.object({
  title: z.string(),
  rationale: z.string(),
  paths: z.array(z.string()).min(1).max(3),
});
export type OnboardingFirstTaskItem = z.infer<typeof OnboardingFirstTaskItem>;

const sectionBase = {
  title: z.string(),
  provenance: OnboardingProvenance,
  available: z.boolean(),
  unavailable_reason: z.string().nullable(),
  body_markdown: z.string().nullable(),
  diagram: z.string().nullable(),
};

export const OnboardingSection = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('architecture_overview'),
    ...sectionBase,
    items: z.array(z.never()),
  }),
  z.object({
    kind: z.literal('critical_paths'),
    ...sectionBase,
    items: z.array(OnboardingCriticalPathItem),
  }),
  z.object({
    kind: z.literal('run_locally'),
    ...sectionBase,
    items: z.array(OnboardingRunCommandItem),
  }),
  z.object({
    kind: z.literal('reading_path'),
    ...sectionBase,
    items: z.array(OnboardingReadingPathItem),
  }),
  z.object({
    kind: z.literal('first_tasks'),
    ...sectionBase,
    items: z.array(OnboardingFirstTaskItem),
  }),
]);
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const OnboardingTour = z
  .object({
    generated_at: z.string(),
    mode: z.enum(['narrative', 'skeleton']),
    skeleton_reason: OnboardingSkeletonReason.nullable(),
    completeness: z.enum(['full', 'partial']),
    partial_reasons: z.array(OnboardingPartialReason),
    index: OnboardingIndexSummary,
    llm: OnboardingLlmUsage,
    dropped_ai_items: z.number().int().min(0),
    skipped_files: z.array(OnboardingSkippedFile),
    sections: z.array(OnboardingSection).length(5),
  })
  .superRefine((tour, ctx) => {
    const order = OnboardingSectionKind.options;
    tour.sections.forEach((s, i) => {
      if (s.kind !== order[i]) {
        ctx.addIssue({
          code: 'custom',
          path: ['sections', i, 'kind'],
          message: `section ${i} must be ${order[i]}`,
        });
      }
    });
    if ((tour.mode === 'skeleton') !== (tour.skeleton_reason !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['skeleton_reason'],
        message: 'skeleton_reason must be set iff mode is skeleton',
      });
    }
  });
export type OnboardingTour = z.infer<typeof OnboardingTour>;

export const OnboardingLastFailure = z.object({
  at: z.string(),
  reason: OnboardingSkeletonReason,
  provider: z.string().nullable(),
  attempts: z.number().int().nullable(),
});
export type OnboardingLastFailure = z.infer<typeof OnboardingLastFailure>;

export const OnboardingTourResponse = z.object({
  repo_id: z.string(),
  repo_full_name: z.string(),
  tour: OnboardingTour.nullable(),
  current_index: OnboardingIndexSummary,
  generation_in_progress: z.boolean(),
  last_failure: OnboardingLastFailure.nullable(),
});
export type OnboardingTourResponse = z.infer<typeof OnboardingTourResponse>;
