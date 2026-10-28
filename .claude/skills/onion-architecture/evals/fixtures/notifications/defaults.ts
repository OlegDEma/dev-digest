import type { NotificationRuleInput } from '../contracts/notifications.js';
import { DEFAULT_MIN_SEVERITY } from '../settings/index.js';

export function withRuleDefaults(input: Partial<NotificationRuleInput>): NotificationRuleInput {
  return {
    min_severity: input.min_severity ?? DEFAULT_MIN_SEVERITY,
    enabled: input.enabled ?? true,
  };
}
