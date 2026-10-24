import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserDto, SenderDto } from '@inboxpilot/shared';
import { api } from '../services/api.js';

interface AuthContextType {
  user: (UserDto & { senders: SenderDto[] }) | null;
  isLoading: boolean;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
  loginDemoUser: () => void;
  isDemoMode: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<(UserDto & { senders: SenderDto[] }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const fetchCurrentUser = async () => {
    try {
      // 1. Try real backend session first
      const data = await api.auth.getMe();
      setUser(data);
      setIsDemoMode(false);
      localStorage.removeItem('inboxpilot_demo_session');
    } catch {
      // 2. If backend unavailable or not logged in, check if demo session active
      const savedDemo = localStorage.getItem('inboxpilot_demo_session');
      if (savedDemo) {
        try {
          const parsed = JSON.parse(savedDemo);
          setUser(parsed);
          setIsDemoMode(true);
        } catch {
          setUser(null);
          setIsDemoMode(false);
        }
      } else {
        setUser(null);
        setIsDemoMode(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const loginDemoUser = () => {
    const demoUser: UserDto & { senders: SenderDto[] } = {
      id: 'demo-user-evaluator',
      googleId: 'google-evaluator-12345',
      name: 'InboxPilot Evaluator',
      email: 'evaluator@inboxpilot.local',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      senders: [
        {
          id: 'demo-sender-1',
          userId: 'demo-user-evaluator',
          name: 'Growth Outreach',
          email: 'growth@inboxpilot.local',
          isDefault: true,
          hourlyLimit: 200,
          minimumSendIntervalMs: 2000,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    localStorage.setItem('inboxpilot_demo_session', JSON.stringify(demoUser));
    setUser(demoUser);
    setIsDemoMode(true);
  };

  const logout = async () => {
    localStorage.removeItem('inboxpilot_demo_session');
    try {
      await api.auth.logout();
    } catch {}
    setUser(null);
    setIsDemoMode(false);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        logout,
        refetchUser: fetchCurrentUser,
        loginDemoUser,
        isDemoMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
