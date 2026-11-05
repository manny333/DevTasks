import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import api from '../services/api';
import type { Notification } from '../types';
import { useAuth } from './AuthContext';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  newArrived: boolean;
  clearNewArrived: () => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  refresh: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [newArrived, setNewArrived] = useState(false);

  // Initial load of existing notifications from DB
  const loadAll = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get<{ notifications: Notification[]; unreadCount: number }>(
        '/notifications'
      );
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.unreadCount);
    } catch {
      // Silently ignore
    }
  }, [user]);

  const refresh = useCallback(() => { loadAll(); }, [loadAll]);

  // Load on mount / user change
  useEffect(() => {
    if (!user) {
      // Clearing another user's inbox is a deliberate reset, not derived state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, [user, loadAll]);

  // SSE connection — authenticated with a single-use ticket, never the JWT in the URL.
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 2000;

    const connect = async () => {
      if (cancelled) return;
      try {
        const res = await api.post<{ ticket: string }>('/notifications/stream-ticket');
        if (cancelled) return;

        source = new EventSource(
          `${API_BASE}/notifications/stream?ticket=${encodeURIComponent(res.data.ticket)}`
        );

        source.onopen = () => {
          retryDelay = 2000;
        };

        source.onmessage = (event) => {
          try {
            const notification: Notification = JSON.parse(event.data);
            setNotifications((prev) => [notification, ...prev]);
            setUnreadCount((prev) => prev + 1);
            setNewArrived(true);
          } catch {
            // Ignore malformed events
          }
        };

        source.onerror = () => {
          source?.close();
          source = null;
          if (cancelled) return;
          retryTimer = setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30000);
        };
      } catch {
        if (cancelled) return;
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
      }
    };

    void connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [user]);

  const markRead = useCallback(async (id: string) => {
    await api.patch(`/notifications/${id}/read`);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await api.patch('/notifications/read-all');
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  const dismiss = useCallback(async (id: string) => {
    const notification = notifications.find((n) => n.id === id);
    await api.delete(`/notifications/${id}`);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (notification && !notification.read) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  }, [notifications]);

  const clearNewArrived = useCallback(() => setNewArrived(false), []);

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, loading, newArrived, clearNewArrived, markRead, markAllRead, dismiss, refresh }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider');
  return ctx;
}
