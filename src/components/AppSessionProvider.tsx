'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface AppSessionUser {
  id: string;
  email: string | null;
}

interface AppSessionValue {
  configured: boolean;
  user: AppSessionUser | null;
  mode: 'authenticated' | 'local';
}

interface AppSessionProviderProps {
  configured: boolean;
  user: AppSessionUser | null;
  children: ReactNode;
}

const AppSessionContext = createContext<AppSessionValue | null>(null);

export function AppSessionProvider({
  configured,
  user,
  children,
}: AppSessionProviderProps) {
  return (
    <AppSessionContext.Provider value={{
      configured,
      user,
      mode: configured ? 'authenticated' : 'local',
    }}>
      {children}
    </AppSessionContext.Provider>
  );
}

export function useAppSession(): AppSessionValue {
  const value = useContext(AppSessionContext);
  if (!value) throw new Error('useAppSession must be used inside AppSessionProvider');
  return value;
}
