// app/_layout.tsx
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { SessionProvider, useSession } from '../context/ctx';
import { NotificationProvider } from '../context/NotificationContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CustomBottomNav from '../components/CustomBottomNav';
import CustomSidebar from '../components/CustomSidebar';
import CustomTopNav from '../components/CustomTopNav';

const glassTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#74A5A8',
    primaryContainer: 'rgba(116,165,168,0.2)',
    secondary: '#9BB88D',
    secondaryContainer: 'rgba(155,184,141,0.2)',
    surface: 'rgba(255,255,255,0.7)',
    surfaceVariant: 'rgba(116,165,168,0.1)',
    background: '#E0EBE2',
    onPrimary: '#FFFFFF',
    onSecondary: '#FFFFFF',
    onSurface: '#333333',
    onSurfaceVariant: '#666666',
    outline: 'rgba(116,165,168,0.3)',
    elevation: {
      level0: 'transparent',
      level1: 'rgba(255,255,255,0.7)',
      level2: 'rgba(255,255,255,0.75)',
      level3: 'rgba(255,255,255,0.8)',
      level4: 'rgba(255,255,255,0.85)',
      level5: 'rgba(255,255,255,0.9)',
    },
  },
  roundness: 12,
};

function RootLayoutNav() {
  const { session, isLoading } = useSession();
  const segments = useSegments() || [];
  const router = useRouter();
  const [sidebarVisible, setSidebarVisible] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = (segments[0] as string) === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/' as any);
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)/' as any);
    }
  }, [session, segments, isLoading, router]);

  const handleMenuPress = () => {
    setSidebarVisible(!sidebarVisible);
  };

  return (
    session && !isLoading ? (
      <NotificationProvider>
        <CustomSidebar visible={sidebarVisible} onClose={() => setSidebarVisible(false)} />
        <View style={{ flex: 1 }}>
          <CustomTopNav onMenuPress={handleMenuPress} />
          <View style={{ flex: 1 }}>
            <View style={{ flex: 1 }}>
              <Slot />
            </View>
          </View>
          <CustomBottomNav />
        </View>
      </NotificationProvider>
    ) : (
      <Slot />
    )
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={glassTheme}>
        <SessionProvider>
          <RootLayoutNav />
        </SessionProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
