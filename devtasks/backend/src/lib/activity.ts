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
