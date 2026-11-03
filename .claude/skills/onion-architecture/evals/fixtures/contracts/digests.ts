import { z } from 'zod';

export const DigestHealth = z.enum(['green', 'amber', 'red']);
export type DigestHealth = z.infer<typeof DigestHealth>;

export const WeeklyDigestRequest = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});
export type WeeklyDigestRequest = z.infer<typeof WeeklyDigestRequest>;

export const WeeklyDigest = z.object({
  id: z.string().uuid(),
  repo_id: z.string().uuid(),
  from: z.string(),
  to: z.string(),
  summary: z.string(),
  health: DigestHealth,
  cost_usd: z.number(),
  created_at: z.string(),
});
export type WeeklyDigest = z.infer<typeof WeeklyDigest>;
