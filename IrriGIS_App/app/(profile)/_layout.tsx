// app/(profile)/_layout.tsx
import { Slot } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useSession } from '../../context/ctx';

export default function ProfileLayout() {
  const { session, isLoading } = useSession();

  if (isLoading || !session) {
    return <View style={styles.container} />;
  }

  return <Slot />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E0EBE2',
  },
});