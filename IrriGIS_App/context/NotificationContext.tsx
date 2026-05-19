import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { getNotifications, getUnreadNotificationCount, markNotificationAsRead, markAllNotificationsAsRead, deleteNotification } from '../services/api';

interface Notification {
  id: string;
  user_id: string;
  ticket_id?: string;
  report_id?: string;
  related_ticket_id?: string;
  type: string;
  title?: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotif: (id: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  loading: false,
  fetchNotifications: async () => {},
  markAsRead: async () => {},
  markAllAsRead: async () => {},
  deleteNotif: async () => {},
});

export function useNotifications() {
  const value = useContext(NotificationContext);
  if (process.env.NODE_ENV !== 'production') {
    if (!value) {
      throw new Error('useNotifications must be wrapped in a <NotificationProvider />');
    }
  }
  return value;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await getUnreadNotificationCount();
      // Backend returns: { success: true, data: { unread_count: n } }
      setUnreadCount(res.data?.data?.unread_count || 0);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getNotifications({ limit: 50 });
      console.log('[NotificationContext] API response:', JSON.stringify(res.data, null, 2));
      // Backend returns: { success: true, data: [...notifications], unread_count: n }
      const responseData = res.data;
      const notifications = responseData?.data || [];
      const unreadCount = responseData?.unread_count || 0;
      console.log(`[NotificationContext] Parsed: ${notifications.length} notifications, ${unreadCount} unread`);
      setNotifications(Array.isArray(notifications) ? notifications : []);
      setUnreadCount(unreadCount);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await markNotificationAsRead(id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await markAllNotificationsAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  }, []);

  const deleteNotif = useCallback(async (id: string) => {
    try {
      await deleteNotification(id);
      const notif = notifications.find(n => n.id === id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (notif && !notif.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  }, [notifications]);

  useEffect(() => {
    fetchNotifications();
    pollIntervalRef.current = setInterval(fetchNotifications, 30000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [fetchNotifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotif,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
