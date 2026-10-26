import { z } from 'zod';

// ---- Project Context: discovered docs, read/save, attach-list bodies ----

export const DocumentStatus = z.enum(['ok', 'too_large', 'unreadable']);
export type DocumentStatus = z.infer<typeof DocumentStatus>;

export const DiscoveredDocument = z.object({
  path: z.string(),
  folder: z.string(),
  name: z.string(),
  /** Free lowercase string — the bucket set is configurable. */
  bucket: z.string(),
  size_bytes: z.number().int().nonnegative(),
  status: DocumentStatus,
  /** Tokens of the exact wrapped text the doc contributes; null when not readable. */
  estimated_tokens: z.number().int().nonnegative().nullable(),
  used_by_agents: z.number().int().nonnegative(),
});
export type DiscoveredDocument = z.infer<typeof DiscoveredDocument>;

export const ProjectContextListing = z.object({
  repo_id: z.string(),
  clone_available: z.boolean(),
  total_found: z.number().int().nonnegative(),
  truncated: z.boolean(),
  documents: z.array(DiscoveredDocument).max(2000),
});
export type ProjectContextListing = z.infer<typeof ProjectContextListing>;

export const DocumentContent = DiscoveredDocument.extend({
  text: z.string(),
  tracked: z.boolean(),
});
export type DocumentContent = z.infer<typeof DocumentContent>;

export const DocumentQuery = z.object({ path: z.string() });
export type DocumentQuery = z.infer<typeof DocumentQuery>;

export const SaveDocumentBody = z.object({ path: z.string(), text: z.string() });
export type SaveDocumentBody = z.infer<typeof SaveDocumentBody>;

/** Shape only — domain rules (limits, uniqueness, path guard) run in the service. */
export const SetContextDocsBody = z.object({ context_docs: z.array(z.string()) });
export type SetContextDocsBody = z.infer<typeof SetContextDocsBody>;

export const ProjectContextErrorCode = z.enum([
  'invalid_path',
  'document_not_found',
  'repo_not_cloned',
  'document_too_large',
  'document_unreadable',
  'document_write_failed',
  'duplicate_path',
  'attachment_limit',
]);
export type ProjectContextErrorCode = z.infer<typeof ProjectContextErrorCode>;
