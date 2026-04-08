import { createContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  changePasswordRequest,
  getMe,
  loginRequest,
  logoutRequest,
  restoreSession,
} from '../lib/api';
import type { AuthUser } from '../types/auth';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
  completePasswordChange: (currentPassword: string, newPassword: string) => Promise<void>;
  isAdmin: boolean;
  isFaculty: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const session = await restoreSession();
        if (active) {
          setUser(session?.user ?? null);
        }
      } catch {
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    user,
    isLoading,
    async login(email: string, password: string) {
      const session = await loginRequest(email, password);
      setUser(session.user);
      return session.user;
    },
    async logout() {
      await logoutRequest();
      setUser(null);
    },
    async refreshUser() {
      try {
        const nextUser = await getMe();
        setUser(nextUser);
        return nextUser;
      } catch {
        setUser(null);
        return null;
      }
    },
    async completePasswordChange(currentPassword: string, newPassword: string) {
      await changePasswordRequest(currentPassword, newPassword);
      setUser((current) => current ? { ...current, mustChangePassword: false } : current);
    },
    isAdmin: user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN',
    isFaculty: user?.role === 'FACULTY',
  }), [isLoading, user]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export { AuthContext };
