import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import type { ActivityLog } from '../../types';

interface ActivityTimelineProps {
  taskId: string;
}

export default function ActivityTimeline({ taskId }: ActivityTimelineProps) {
  const { t } = useTranslation();
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/tasks/${taskId}/activity`)
      .then((res) => setActivities(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [taskId]);

  const formatRelative = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return t('activity.justNow');
    if (diffMin < 60) return t('activity.minutesAgo', { n: diffMin });
    if (diffHour < 24) return t('activity.hoursAgo', { n: diffHour });
    if (diffDay < 7) return t('activity.daysAgo', { n: diffDay });
    return date.toLocaleDateString();
  };

  const describeAction = (a: ActivityLog) => {
    const details = a.details as Record<string, string> | null;
    switch (a.action) {
      case 'TASK_CREATED': return t('activity.action.TASK_CREATED');
      case 'TASK_UPDATED': return t('activity.action.TASK_UPDATED');
      case 'TASK_STATUS_CHANGED':
        return t('activity.action.TASK_STATUS_CHANGED', {
          from: t(`tasks.status.${details?.oldStatus as string}`),
          to: t(`tasks.status.${details?.newStatus as string}`),
        });
      case 'TASK_MOVED_SECTION':
        return t('activity.action.TASK_MOVED_SECTION', { section: a.sectionName ?? details?.toSectionName ?? '' });
      case 'TASK_ARCHIVED': return t('activity.action.TASK_ARCHIVED');
      case 'TASK_UNARCHIVED': return t('activity.action.TASK_UNARCHIVED');
      case 'TASK_DELETED': return t('activity.action.TASK_DELETED');
      case 'COMMENT_ADDED': return t('activity.action.COMMENT_ADDED');
      case 'COMMENT_DELETED': return t('activity.action.COMMENT_DELETED');
      case 'SUBTASK_ADDED': return t('activity.action.SUBTASK_ADDED');
      case 'SUBTASK_COMPLETED': return t('activity.action.SUBTASK_COMPLETED');
      case 'SUBTASK_UNCOMPLETED': return t('activity.action.SUBTASK_UNCOMPLETED');
      case 'SUBTASK_DELETED': return t('activity.action.SUBTASK_DELETED');
      case 'ASSIGNEE_ADDED':
        return t('activity.action.ASSIGNEE_ADDED', { user: details?.assigneeName ?? '' });
      case 'ASSIGNEE_REMOVED':
        return t('activity.action.ASSIGNEE_REMOVED', { user: details?.assigneeName ?? '' });
      case 'TAG_ADDED':
        return t('activity.action.TAG_ADDED', { tag: details?.tagName ?? '' });
      case 'TAG_REMOVED':
        return t('activity.action.TAG_REMOVED', { tag: details?.tagName ?? '' });
      case 'ATTACHMENT_UPLOADED': return t('activity.action.ATTACHMENT_UPLOADED');
      case 'ATTACHMENT_DELETED': return t('activity.action.ATTACHMENT_DELETED');
      default: return a.action;
    }
  };

  if (loading) return <div className="activity-timeline-loading">{t('common.loading')}</div>;

  if (activities.length === 0) {
    return <div className="activity-timeline-empty">{t('activity.empty')}</div>;
  }

  return (
    <div className="activity-timeline">
      {activities.map((a) => (
        <div key={a.id} className="activity-item">
          <div className="activity-dot" />
          <div className="activity-body">
            <span className="activity-description">
              <strong>{a.actorName}</strong> {describeAction(a)}
            </span>
            <span className="activity-time">{formatRelative(a.createdAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
