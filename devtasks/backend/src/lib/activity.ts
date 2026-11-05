import prisma from './prisma';
import type { ActivityAction } from '../generated/prisma/enums';

interface LogActivityPayload {
  action: ActivityAction;
  taskId: string;
  taskTitle: string;
  projectId: string;
  sectionId?: string | null;
  sectionName?: string | null;
  actorId: string;
  actorName: string;
  details?: Record<string, unknown>;
}

export async function logActivity(payload: LogActivityPayload): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        action: payload.action,
        taskId: payload.taskId,
        taskTitle: payload.taskTitle,
        projectId: payload.projectId,
        sectionId: payload.sectionId ?? null,
        sectionName: payload.sectionName ?? null,
        actorId: payload.actorId,
        actorName: payload.actorName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        details: (payload.details ?? null) as any,
      },
    });
  } catch (err) {
    console.error('[activity] Failed to log activity:', err);
  }
}

/**
 * Convenience wrapper for routes that only have a task id: resolves the task
 * (title/section/project) and the actor name, then records the event.
 * Fire-and-forget by design — call it with `void` so it never breaks the request.
 */
export async function logTaskEvent(params: {
  taskId: string;
  actorId: string;
  action: ActivityAction;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const [task, actor] = await Promise.all([
      prisma.task.findUnique({
        where: { id: params.taskId },
        select: {
          id: true,
          title: true,
          section: { select: { id: true, name: true, projectId: true } },
        },
      }),
      prisma.user.findUnique({
        where: { id: params.actorId },
        select: { name: true },
      }),
    ]);

    if (!task) return;

    await logActivity({
      action: params.action,
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.section.projectId,
      sectionId: task.section.id,
      sectionName: task.section.name,
      actorId: params.actorId,
      actorName: actor?.name ?? 'Someone',
      details: params.details,
    });
  } catch (err) {
    console.error('[activity] Failed to resolve task event:', err);
  }
}
