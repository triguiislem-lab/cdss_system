import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { getCurrentUserApi, loginApi } from "@/lib/backend-api";
import { useLocation } from "wouter";

export type UserRole = "admin" | "doctor";

export interface AuthUser {
  id: string;
  prenom?: string;
  nom: string;
  email: string;
  role: UserRole;
  telephone?: string;
  matriculeFiscale?: string;
  specialite?: string;
  numeroCNOM?: string;
  avatar?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string; role?: UserRole }>;
  logout: () => void;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);
const TOKEN_KEY = "medcity-auth-token";
const REFRESH_TOKEN_KEY = "medcity-refresh-token";
const AUTH_EXPIRED_EVENT = "medcity-auth-expired";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [location, setLocation] = useLocation();

  function toAuthUser(input: { id: string; email: string; role: UserRole }): AuthUser {
    return {
      id: input.id,
      email: input.email,
      role: input.role,
      nom: input.email.split("@")[0],
    };
  }

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsAuthLoading(false);
      return;
    }

    void (async () => {
      try {
        setUser(toAuthUser(await getCurrentUserApi()));
      } catch {
        window.localStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(REFRESH_TOKEN_KEY);
        setUser(null);
      } finally {
        setIsAuthLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    function handleAuthExpired() {
      setUser(null);
      setIsAuthLoading(false);
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(REFRESH_TOKEN_KEY);
      if (location !== "/login" && !location.startsWith("/reset-password")) {
        setLocation("/login");
      }
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, [location, setLocation]);

  async function login(email: string, password: string) {
    try {
      const data = await loginApi(email, password);
      window.localStorage.setItem(TOKEN_KEY, data.accessToken);
      window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
      const authUser = toAuthUser(data.user);
      setUser(authUser);
      return { ok: true, role: authUser.role };
    } catch (error) {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(REFRESH_TOKEN_KEY);
      return { ok: false, error: error instanceof Error ? error.message : "Email ou mot de passe incorrect." };
    }
  }

  function logout() {
    setUser(null);
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, isAuthLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
