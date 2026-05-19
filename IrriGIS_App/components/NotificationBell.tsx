// components/NotificationBell.tsx
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Modal,
  FlatList,
  Dimensions,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, Portal } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useNotifications } from '../context/NotificationContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface NotificationBellProps {
  /** Icon color based on camera mode */
  iconColor?: string;
}

export default function NotificationBell({ iconColor = '#333' }: NotificationBellProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { notifications, unreadCount, markAsRead, markAllAsRead, fetchNotifications } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(-300)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const openDropdown = useCallback(() => {
    setIsOpen(true);
    console.log(`[NotificationBell] Opening - unread: ${unreadCount}, notifications: ${notifications.length}`);
    fetchNotifications(); // Refresh when opening
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fetchNotifications, slideAnim, fadeAnim]);

  const closeDropdown = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -300,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsOpen(false);
    });
  }, [slideAnim, fadeAnim]);

  const toggleDropdown = () => {
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  };

  const handleNotificationPress = async (id: string, ticketId?: string) => {
    await markAsRead(id);
    closeDropdown();
    if (ticketId) {
      router.push(`/(tabs)/ticket/${ticketId}` as any);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'ticket_assigned': return 'person-add';
      case 'ticket_status_changed': return 'flag';
      case 'ticket_comment': return 'chatbubble';
      case 'report_created': return 'document-text';
      case 'new_report': return 'alert-circle';
      default: return 'notifications';
    }
  };

  const recentNotifications = notifications.slice(0, 5);

  return (
    <>
      {/* Bell Button with Badge */}
      <TouchableOpacity 
        onPress={toggleDropdown} 
        style={styles.button} 
        activeOpacity={0.7}
      >
        <Ionicons name="notifications-outline" size={28} color={iconColor} />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Dropdown Modal */}
      {isOpen && (
        <Modal
          visible={isOpen}
          transparent
          animationType="none"
          onRequestClose={closeDropdown}
        >
          <TouchableWithoutFeedback onPress={closeDropdown}>
            <View style={styles.overlay}>
              <TouchableWithoutFeedback>
                <Animated.View
                  style={[
                    styles.dropdown,
                    {
                      opacity: fadeAnim,
                      transform: [{ translateY: slideAnim }],
                      top: 56 + insets.top,
                      right: 8,
                    },
                  ]}
                >
                  {/* Header */}
                  <View style={styles.header}>
                    <Text style={styles.headerTitle}>Notifications</Text>
                    {unreadCount > 0 && (
                      <TouchableOpacity onPress={handleMarkAllRead}>
                        <Text style={styles.markAllText}>Mark all read</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Notification List */}
                  {recentNotifications.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Ionicons name="notifications-off-outline" size={40} color="#ccc" />
                      <Text style={styles.emptyText}>No notifications</Text>
                    </View>
                  ) : (
                    <FlatList
                      data={recentNotifications}
                      keyExtractor={(item) => item.id}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={[styles.notifItem, !item.is_read && styles.unreadItem]}
                          onPress={() => handleNotificationPress(item.id, item.related_ticket_id)}
                        >
                          <View style={styles.notifIconContainer}>
                            <Ionicons
                              name={getTypeIcon(item.type) as any}
                              size={20}
                              color={!item.is_read ? '#74A5A8' : '#999'}
                            />
                          </View>
                          <View style={styles.notifContent}>
                            <Text
                              style={[styles.notifTitle, !item.is_read && styles.unreadText]}
                              numberOfLines={1}
                            >
                              {item.title || item.type}
                            </Text>
                            <Text style={styles.notifMessage} numberOfLines={2}>
                              {item.message}
                            </Text>
                            <Text style={styles.notifTime}>{formatTime(item.created_at)}</Text>
                          </View>
                          {!item.is_read && <View style={styles.unreadDot} />}
                        </TouchableOpacity>
                      )}
                      style={styles.list}
                      showsVerticalScrollIndicator={false}
                    />
                  )}

                  {/* Footer */}
                  {notifications.length > 5 && (
                    <TouchableOpacity style={styles.footer} onPress={closeDropdown}>
                      <Text style={styles.footerText}>
                        +{notifications.length - 5} more notifications
                      </Text>
                    </TouchableOpacity>
                  )}
                </Animated.View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 8,
    borderRadius: 8,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 998, // High z-index to appear above most elements
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#FF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 997, // High z-index for overlay
  },
  dropdown: {
    position: 'absolute',
    width: Math.min(SCREEN_WIDTH * 0.85, 340),
    maxHeight: 400,
    backgroundColor: '#fff',
    borderRadius: 16,
    zIndex: 999, // Highest z-index for dropdown
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
    top: 80, // Position below status bar and button
    right: 12, // Align with bell button
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(116,165,168,0.2)',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  markAllText: {
    fontSize: 13,
    color: '#74A5A8',
    fontWeight: '600',
  },
  list: {
    maxHeight: 320,
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(116,165,168,0.1)',
  },
  unreadItem: {
    backgroundColor: 'rgba(116,165,168,0.08)',
  },
  notifIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(116,165,168,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notifContent: {
    flex: 1,
  },
  notifTitle: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
    marginBottom: 2,
  },
  unreadText: {
    color: '#333',
    fontWeight: '700',
  },
  notifMessage: {
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
    marginBottom: 4,
  },
  notifTime: {
    fontSize: 11,
    color: '#aaa',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#74A5A8',
    marginLeft: 8,
    marginTop: 6,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: 12,
    color: '#999',
    fontSize: 14,
  },
  footer: {
    padding: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(116,165,168,0.2)',
  },
  footerText: {
    color: '#74A5A8',
    fontSize: 13,
    fontWeight: '600',
  },
});
