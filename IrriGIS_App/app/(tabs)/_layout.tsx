// app/(tabs)/_layout.tsx
import { Slot } from 'expo-router';
import { useSession } from '../../context/ctx';
import { SheetProvider, useSheet } from '../../context/SheetContext';
import { StyleSheet, View } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useState, useEffect } from 'react';

function TabLayoutContent() {
  const { session, isLoading } = useSession();
  const router = useRouter();
  const rawPathname = usePathname();
  const [pathname, setPathname] = useState('/');
  const [showSidebar, setShowSidebar] = useState(false);
  const { isSheetOpen } = useSheet();
  
  useEffect(() => {
    if (rawPathname && typeof rawPathname === 'string') {
      setPathname(rawPathname);
    }
  }, [rawPathname]);
  
  useEffect(() => {
    setShowSidebar(false);
  }, [pathname]);

  return (
    <View style={styles.container}>
      {isLoading || !session ? (
        <View style={{ flex: 1, backgroundColor: '#E0EBE2' }} />
      ) : (
        <View style={styles.content}>
          <Slot />
        </View>
      )}
    </View>
  );
}

export default function TabLayout() {
  return (
    <SheetProvider>
      <TabLayoutContent />
    </SheetProvider>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    backgroundColor: '#E0EBE2',
  },
  content: {
    flex: 1,
  },
  bottomNavContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});