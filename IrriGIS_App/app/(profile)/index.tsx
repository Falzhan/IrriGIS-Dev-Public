// app/(profile)/index.tsx
import { Redirect } from 'expo-router';

export default function ProfileIndex() {
  return <Redirect href="/(profile)/profile" />;
}