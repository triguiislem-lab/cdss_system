import { createContext, useContext, useState, ReactNode } from "react";
import { loginApi } from "@/lib/backend-api";

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
}

const AuthContext = createContext<AuthContextType | null>(null);
const TOKEN_KEY = "medcity-auth-token";
const REFRESH_TOKEN_KEY = "medcity-refresh-token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  async function login(email: string, password: string) {
    try {
      const data = await loginApi(email, password);
      window.localStorage.setItem(TOKEN_KEY, data.accessToken);
      window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
      const authUser: AuthUser = {
        id: data.user.id,
        email: data.user.email,
        role: data.user.role,
        nom: data.user.email.split("@")[0],
      };
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
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
