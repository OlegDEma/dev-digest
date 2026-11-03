import type { Container } from '../platform/container.js';
import { NotificationService } from '../notifications/service.js';

export function onReviewCompleted(container: Container, workspaceId: string, reviewId: string): void {
  const notifications = new NotificationService(container);
  void notifications.notifyForReview(workspaceId, reviewId).catch(() => {});
}
