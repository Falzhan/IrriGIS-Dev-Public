import React, { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { getUserData, logoutUser, setSessionExpiredHandler } from '../services/api';

const AuthContext = React.createContext<{
  signIn: (token: string, user?: any) => void;
  signOut: () => void;
  session?: string | null;
  user?: any;
  isLoading: boolean;
}>({
  signIn: () => null,
  signOut: () => null,
  session: null,
  user: null,
  isLoading: true,
});

export function useSession() {
  const value = React.useContext(AuthContext);
  if (process.env.NODE_ENV !== 'production') {
    if (!value) {
      throw new Error('useSession must be wrapped in a <SessionProvider />');
    }
  }
  return value;
}

export function SessionProvider(props: React.PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkSession();
    setSessionExpiredHandler(() => {
      setSession(null);
      setUser(null);
    });
  }, []);

  const checkSession = async () => {
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      const userStr = await SecureStore.getItemAsync('user_data');
      
      if (token && userStr) {
        setSession(token);
        setUser(JSON.parse(userStr));
      }
    } catch (error) {
      console.error('Error checking session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async (token: string, userData?: any) => {
    await SecureStore.setItemAsync('auth_token', token);
    if (userData) {
      await SecureStore.setItemAsync('user_data', JSON.stringify(userData));
      setUser(userData);
    }
    setSession(token);
  };

  const signOut = async () => {
    try {
      await logoutUser();
    } catch (error) {
      console.error('Logout error:', error);
    }
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        signIn,
        signOut,
        session,
        user,
        isLoading,
      }}
    >
      {props.children}
    </AuthContext.Provider>
  );
}