import { z } from 'zod';
import { Severity } from './findings.js';

export const NotificationRuleInput = z.object({
  min_severity: Severity,
  enabled: z.boolean().optional(),
});
export type NotificationRuleInput = z.infer<typeof NotificationRuleInput>;

export const NotificationRule = z.object({
  id: z.string().uuid(),
  repo_id: z.string().uuid(),
  min_severity: Severity,
  enabled: z.boolean(),
  created_at: z.string(),
});
export type NotificationRule = z.infer<typeof NotificationRule>;
