import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AuthMethod = 'google' | 'apple' | 'facebook' | 'guest' | null;

export interface AuthUser {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  method: AuthMethod;
  isGuest: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  login: (method: AuthMethod) => void;
  logout: () => void;
}

const MOCK_USERS: Record<NonNullable<Exclude<AuthMethod, 'guest'>>, AuthUser> = {
  google: {
    id: 'google-001', name: 'Carlos Méndez',
    email: 'carlos.mendez@gmail.com', avatar: 'CM',
    method: 'google', isGuest: false,
  },
  apple: {
    id: 'apple-001', name: 'Usuario Apple',
    email: 'usuario@icloud.com', avatar: 'UA',
    method: 'apple', isGuest: false,
  },
  facebook: {
    id: 'fb-001', name: 'Carlos Méndez',
    email: 'carlos.mendez@facebook.com', avatar: 'CM',
    method: 'facebook', isGuest: false,
  },
};

const GUEST_USER: AuthUser = {
  id: 'guest-001', name: 'Visitante',
  method: 'guest', isGuest: true,
};

const AUTH_KEY = 'analistas_auth_user';

const AuthContext = createContext<AuthContextType>({
  user: null, isAuthenticated: false, isGuest: false,
  login: () => {}, logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(AUTH_KEY).then(raw => {
      if (raw) {
        try { setUser(JSON.parse(raw)); } catch {}
      }
    });
  }, []);

  const login = useCallback((method: AuthMethod) => {
    if (!method) return;
    const newUser = method === 'guest' ? GUEST_USER : MOCK_USERS[method];
    setUser(newUser);
    AsyncStorage.setItem(AUTH_KEY, JSON.stringify(newUser));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    AsyncStorage.removeItem(AUTH_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isGuest: user?.isGuest ?? false, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
