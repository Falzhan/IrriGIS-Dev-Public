// app/(tabs)/ticket/_layout.tsx
import { Stack } from 'expo-router';

export default function TicketLayout() {
  return (
    <Stack screenOptions={{
      headerShown: false,
    }}>
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
