import { z } from 'zod';

export const Severity = z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']);
export type Severity = z.infer<typeof Severity>;

export const FindingCategory = z.enum(['bug', 'security', 'perf', 'style', 'test']);
export type FindingCategory = z.infer<typeof FindingCategory>;

export const Finding = z.object({
  id: z.string().uuid(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  severity: Severity,
  category: FindingCategory,
  title: z.string(),
  body: z.string(),
});
export type Finding = z.infer<typeof Finding>;
