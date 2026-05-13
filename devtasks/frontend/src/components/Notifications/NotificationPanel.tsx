import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../../context/NotificationContext';
import type { Notification } from '../../types';
import '../../styles/notifications.css';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NotificationItem({
  notification,
  onRead,
  onDismiss,
}: {
  notification: Notification;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const { t } = useTranslation();

  const label = t(`notifications.types.${notification.type}`, {
    actor: notification.actorName,
    task: notification.taskTitle ?? t('notifications.unknownTask'),
    status: notification.meta?.newStatus
      ? t(`tasks.status.${notification.meta.newStatus as string}`, {
          defaultValue: notification.meta.newStatus as string,
        })
      : '',
  });

  return (
    <div
      className={`notif-item${notification.read ? '' : ' notif-item--unread'}`}
      onClick={() => !notification.read && onRead(notification.id)}
    >
      <div className="notif-item__body">
        <span className="notif-item__icon">{iconFor(notification.type)}</span>
        <div className="notif-item__content">
          <p className="notif-item__label">{label}</p>
          {notification.projectName && (
            <p className="notif-item__project">{notification.projectName}</p>
          )}
          <p className="notif-item__time">{timeAgo(notification.createdAt)}</p>
        </div>
      </div>
      <button
        className="notif-item__dismiss btn-icon"
        title={t('notifications.dismiss')}
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(notification.id);
        }}
      >
        ✕
      </button>
    </div>
  );
}

function iconFor(type: Notification['type']) {
  switch (type) {
    case 'COMMENT_ADDED': return '💬';
    case 'TASK_ASSIGNED': return '✅';
    case 'TASK_UNASSIGNED': return '🔕';
    case 'TASK_STATUS_CHANGED': return '🔄';
  }
}

interface Props {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

export default function NotificationPanel({ anchorRef, onClose }: Props) {
  const { t } = useTranslation();
  const { notifications, unreadCount, markRead, markAllRead, dismiss } = useNotifications();
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);

  // Calculate position from anchor button
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [anchorRef]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  if (!coords) return null;

  return createPortal(
    <div
      className="notif-panel"
      ref={panelRef}
      style={{ top: coords.top, right: coords.right }}
    >
      <div className="notif-panel__header">
        <h3 className="notif-panel__title">{t('notifications.title')}</h3>
        {unreadCount > 0 && (
          <button className="notif-panel__read-all" onClick={markAllRead}>
            {t('notifications.markAllRead')}
          </button>
        )}
      </div>

      <div className="notif-panel__list">
        {notifications.length === 0 ? (
          <p className="notif-panel__empty">{t('notifications.empty')}</p>
        ) : (
          notifications.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onRead={markRead}
              onDismiss={dismiss}
            />
          ))
        )}
      </div>
    </div>,
    document.body
  );
}
