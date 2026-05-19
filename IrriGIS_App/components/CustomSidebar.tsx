// components/CustomSidebar.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, Animated, StyleSheet, Dimensions, Image } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from 'react-native-paper';
import { useRouter, usePathname } from 'expo-router';
import { useSession } from '../context/ctx';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.7, 300);

interface CustomSidebarProps {
  visible: boolean;
  onClose: () => void;
}

export default function CustomSidebar({ visible, onClose }: CustomSidebarProps) {
  const router = useRouter();
  const pathname = usePathname() || '';
  const { user, signOut } = useSession();
  
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [isRendered, setIsRendered] = useState(visible);
  
  useEffect(() => {
    if (visible) {
      setIsRendered(true);
      // Animate in - faster animation (200ms)
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true })
      ]).start();
    } else {
      // Animate out then hide - faster animation (200ms)
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -DRAWER_WIDTH, duration: 200, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true })
      ]).start(() => {
        setIsRendered(false);
      });
    }
  }, [visible]);

  const getProfileImageUrl = () => {
    if (user?.profile_image_url) {
      // If it's already a full Supabase URL, return as-is
      if (user.profile_image_url.startsWith('https://')) {
        return user.profile_image_url;
      }
      
      // Legacy local path - redirect to backend which redirects to Supabase
      const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.192:3000';
      return `${API_BASE_URL}/users/${user.profile_image_url}`;
    }
    return null;
  };

  const getInitials = () => {
    if (!user) return '?';
    const first = user.first_name?.[0] || '';
    const last = user.last_name?.[0] || '';
    return (first + last).toUpperCase();
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'nia_admin': return 'NIA Administrator';
      case 'nia_field_officer': return 'NIA Field Officer';
      case 'ia_admin': return 'IA Administrator';
      case 'ia_member': return 'IA Member';
      default: return role;
    }
  };

  const menuItems = [
    { name: 'index', label: 'All Reports', icon: 'file-tray-outline', iconActive: 'file-tray-full', path: '/' },
    { name: 'my-reports', label: 'My Reports', icon: 'paper-plane-outline', iconActive: 'paper-plane', path: '/?tab=me' },
    { name: 'camera', label: 'Geo Camera', icon: 'camera-outline', iconActive: 'camera', path: '/(tabs)/camera' },
    { name: 'map', label: 'GIS Map', icon: 'map-outline', iconActive: 'map', path: '/(tabs)/map' },
  ];

  const handleMenuPress = (path: string) => {
    onClose();
    router.push(path as any);
  };

  const handleLogout = () => {
    onClose();
    signOut();
  };

  if (!isRendered) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <TouchableOpacity 
        style={styles.backdrop} 
        onPress={onClose}
        activeOpacity={1}
      />
      <Animated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}>
        <SafeAreaView edges={['top']} style={styles.drawerSafeArea}>
          <View style={styles.drawerContent}>
            <View style={styles.drawerHeader}>
              <View style={styles.avatar}>
                {getProfileImageUrl() ? (
                  <Image
                    source={{ uri: getProfileImageUrl() }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <Text style={styles.avatarText}>{getInitials()}</Text>
                )}
              </View>
              <Text variant="titleLarge" style={styles.userName}>
                {user?.first_name} {user?.last_name}
              </Text>
              <Text variant="bodyMedium" style={styles.userRole}>
                {user?.irrigator_association?.name || getRoleLabel(user?.role)}
              </Text>
            </View>
            
            <View style={styles.drawerDivider} />
            
            <View style={styles.drawerMenu}>
              {menuItems.map((item) => (
                <TouchableOpacity 
                  key={item.name}
                  style={[
                    styles.drawerItem,
                    pathname.includes(item.name) && styles.drawerItemActive
                  ]}
                  onPress={() => handleMenuPress(item.path)}
                >
                  <Ionicons 
                    name={pathname.includes(item.name) ? item.iconActive as any : item.icon as any} 
                    size={22} 
                    color={pathname.includes(item.name) ? '#74A5A8' : '#666'} 
                  />
                  <Text 
                    style={[
                      styles.drawerItemText,
                      pathname.includes(item.name) && styles.drawerItemTextActive
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.drawerDivider} />
            
            <View style={styles.drawerFooter}>
              <TouchableOpacity style={styles.drawerItem} onPress={() => { onClose(); router.push('/(profile)/profile' as any); }}>
                <Ionicons name="settings-outline" size={22} color="#666" />
                <Text style={styles.drawerItemText}>Settings</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.drawerItem} onPress={handleLogout}>
                <Ionicons name="exit-outline" size={22} color="#666" />
                <Text style={styles.drawerItemText}>Log Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000, // Higher than CustomTopNav to appear on top
    elevation: 1000, // Android elevation for proper stacking
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#fff',
    height: '100%',
  },
  drawerSafeArea: {
    flex: 1,
  },
  drawerContent: {
    flex: 1,
  },
  drawerHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#74A5A8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#74A5A8',
  },
  userName: {
    fontWeight: 'bold',
    fontSize: 22,
    color: '#333',
    textAlign: 'center',
  },
  userRole: {
    fontSize: 18,
    color: '#74A5A8',
    marginTop: 4,
    textAlign: 'center',
  },
  drawerDivider: {
    height: 1,
    backgroundColor: 'rgba(116,165,168,0.2)',
    marginVertical: 8,
  },
  drawerMenu: {
    flex: 1,
    paddingTop: 8,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 16,
  },
  drawerItemActive: {
    backgroundColor: 'rgba(116,165,168,0.1)',
    borderLeftWidth: 3,
    borderLeftColor: '#74A5A8',
  },
  drawerItemText: {
    fontSize: 22,
    color: '#665',
  },
  drawerItemTextActive: {
    color: '#74A5A8',
    fontWeight: '600',
  },
  drawerFooter: {
    paddingBottom: 20,
  },
});