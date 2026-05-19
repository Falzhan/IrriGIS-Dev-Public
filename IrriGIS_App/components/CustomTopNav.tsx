// components/CustomTopNav.tsx
import React, { useEffect, useRef } from 'react';
import { View, TouchableOpacity, Animated, StyleSheet, Image, StatusBar } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSheet } from '../context/SheetContext';
import NotificationBell from './NotificationBell';

interface CustomTopNavProps {
  /** Called when menu button is pressed */
  onMenuPress: () => void;
}

export default function CustomTopNav({ onMenuPress }: CustomTopNavProps) {
  const pathname = usePathname() || '';
  const insets = useSafeAreaInsets();
  const { isSheetOpen } = useSheet();
  
  // Camera mode detection - same as bottom nav
  const isCameraMode = pathname.includes('/camera') || pathname.includes('camera');
  // When sheet is open, force the "normal" color, otherwise use camera mode logic
  const shouldBeBlack = isCameraMode && !isSheetOpen;
  const colorAnim = useRef(new Animated.Value(shouldBeBlack ? 1 : 0)).current;
  
  useEffect(() => {
    Animated.timing(colorAnim, { 
      toValue: shouldBeBlack ? 1 : 0, 
      duration: 350,
      useNativeDriver: false 
    }).start();
  }, [shouldBeBlack, colorAnim]);

  const backgroundColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E0EBE2', '#111111'] // 0 = sage green background, 1 = camera black
  });

  // Dynamic status bar style based on camera mode
  const statusBarStyle = shouldBeBlack ? 'light-content' : 'dark-content';

  return (
    <>
      <StatusBar barStyle={statusBarStyle as any} backgroundColor={shouldBeBlack ? '#111111' : '#E0EBE2'} />
      <Animated.View 
        style={[
          styles.container, 
          { 
            backgroundColor,
            paddingTop: insets.top,
            height: 56 + insets.top,
          }
        ]}
      >
        {/* Left: Menu Button */}
        <TouchableOpacity onPress={onMenuPress} style={styles.button} activeOpacity={0.7}>
          <Ionicons 
            name="menu" 
            size={32} 
            color={shouldBeBlack ? '#fff' : '#333'} 
          />
        </TouchableOpacity>

        {/* Center: Logo */}
        <View style={styles.logoContainer}>
          <Image 
            source={require('../assets/images/full-icon.png')} 
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Right: Notification Bell */}
        <NotificationBell iconColor={shouldBeBlack ? '#fff' : '#333'} />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(116,165,168,0.2)',
    zIndex: 50,
  },
  button: {
    padding: 8,
    borderRadius: 8,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 120,
    height: 32,
  },
});
