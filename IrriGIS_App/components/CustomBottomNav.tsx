// components/CustomBottomNav.tsx
import React, { useEffect, useRef } from 'react';
import { View, TouchableOpacity, Animated, StyleSheet, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from 'react-native-paper';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface CustomBottomNavProps {
  /** When true, forces nav to show original color (#9BB88D) instead of camera black */
  isSheetOpen?: boolean;
}

const TabButton = ({ isActive, iconName, activeIconName, label, onPress }: {
  isActive: boolean;
  iconName: string;
  activeIconName: string;
  label: string;
  onPress: () => void;
}) => {
  const activeAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(activeAnim, {
      toValue: isActive ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 60,
    }).start();
  }, [isActive]);

  const pillScaleX = activeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const pillOpacity = activeAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <TouchableOpacity style={styles.navItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.iconContainer}>
        <Animated.View 
          style={[
            StyleSheet.absoluteFill, 
            styles.activePill, 
            { opacity: pillOpacity, transform: [{ scaleX: pillScaleX }] }
          ]} 
        />
        <Ionicons 
          name={isActive ? activeIconName as any : iconName as any} 
          size={24} 
          color="#fff" 
          style={{ zIndex: 1 }}
        />
      </View>
      <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
};

export default function CustomBottomNav({ isSheetOpen = false }: CustomBottomNavProps) {
  const router = useRouter();
  const pathname = usePathname() || '';
  const insets = useSafeAreaInsets();
  
  // Camera mode detection - matches /camera, /(tabs)/camera, or any camera path
  const isCameraMode = pathname.includes('/camera') || pathname.includes('camera');
  // When sheet is open, force the "normal" color (0), otherwise use camera mode logic
  const shouldBeBlack = isCameraMode && !isSheetOpen;
  const colorAnim = useRef(new Animated.Value(shouldBeBlack ? 1 : 0)).current;
  
  useEffect(() => {
    Animated.timing(colorAnim, { 
      toValue: shouldBeBlack ? 1 : 0, 
      duration: 350,
      useNativeDriver: false 
    }).start();
  }, [shouldBeBlack]);

  const backgroundColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#9BB88D', '#111111'] // 0 = original sage green, 1 = camera black
  });

  return (
    <Animated.View 
      style={[
        styles.container, 
        { 
          backgroundColor,
          paddingTop: insets.top > 0 ? 8 : 0,
          paddingBottom: insets.bottom,
          height: 85 + insets.bottom + (insets.top > 0 ? 8 : 0),
        }
      ]}
    >
      <View style={styles.navContent}>
        <TabButton 
          isActive={pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/' || pathname === '/(tabs)/home'} 
          iconName="file-tray-outline" 
          activeIconName="file-tray-full-outline" 
          label="Reports" 
          onPress={() => router.push('/')} 
        />
        
        <TabButton 
          isActive={isCameraMode} 
          iconName="camera-outline" 
          activeIconName="camera" 
          label="Camera" 
          onPress={() => router.push('/(tabs)/camera')} 
        />
        
        <TabButton 
          isActive={pathname === '/map' || pathname === '/(tabs)/map'} 
          iconName="map-outline" 
          activeIconName="map-sharp" 
          label="Map" 
          onPress={() => router.push('/(tabs)/map')} 
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    zIndex: 100, // Always on top of bottom sheet
    ...Platform.select({
      ios: { 
        shadowColor: '#000', 
        shadowOffset: { width: 0, height: -4 }, 
        shadowOpacity: 0.25, 
        shadowRadius: 14,
      },
      android: { 
        elevation: 100, // Always on top
      },
    }),
  },
  navContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-evenly',
    paddingTop: 12,
    paddingHorizontal: 10,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
  },
  iconContainer: {
    width: 64,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    marginBottom: 6,
  },
  activePill: {
    backgroundColor: '#74A5A8',
    borderRadius: 16,
  },
  navLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  navLabelActive: {
    fontWeight: '800',
  },
  
});


