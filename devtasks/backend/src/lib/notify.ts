import prisma from './prisma';
import type { NotificationType } from '../generated/prisma/enums';
import { pushToUser } from './sseManager';

interface NotifyPayload {
  type: NotificationType;
  /** IDs of users who will receive the notification */
  userIds: string[];
  /** Name of the user who triggered the event */
  actorName: string;
  taskId?: string;
  taskTitle?: string;
  projectId?: string;
  projectName?: string;
  /** Extra context, e.g. { newStatus: 'DONE' } */
  meta?: Record<string, unknown>;
}

/**
 * Fire-and-forget helper that creates in-app notifications for a list of users
 * and pushes them over SSE to any currently-connected clients.
 * Silently swallows errors to never break the main request flow.
 */
export async function notify(payload: NotifyPayload): Promise<void> {
  if (payload.userIds.length === 0) return;
  try {
    // Create all notifications and retrieve them with their generated ids/timestamps
    const created = await Promise.all(
      payload.userIds.map((userId) =>
        prisma.notification.create({
          data: {
            type: payload.type,
            userId,
            actorName: payload.actorName,
            taskId: payload.taskId ?? null,
            taskTitle: payload.taskTitle ?? null,
            projectId: payload.projectId ?? null,
            projectName: payload.projectName ?? null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            meta: (payload.meta ?? null) as any,
          },
        })
      )
    );

    // Push each notification to the recipient's SSE stream (if connected)
    for (const notification of created) {
      pushToUser(notification.userId, notification);
    }
  } catch (err) {
    console.error('[notify] Failed to create notifications:', err);
  }
}
