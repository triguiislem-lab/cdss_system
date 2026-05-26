import { createContext, useContext, useState, ReactNode } from "react";

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

const MOCK_USERS: (AuthUser & { password: string })[] = [
  {
    id: "admin1", nom: "Admin MedCity", email: "admin@medcity.tn",
    password: "Admin123", role: "admin",
  },
  {
    id: "d1", prenom: "Ahmed", nom: "Ben Ali", email: "dr.ahmed@medcity.tn",
    password: "Medcity123", role: "doctor", specialite: "Cardiologie",
    numeroCNOM: "CNOM-102948", telephone: "+216 71 234 567", matriculeFiscale: "MF-102948",
  },
  {
    id: "d2", prenom: "Rania", nom: "Zouari", email: "dr.rania@medcity.tn",
    password: "Medcity123", role: "doctor", specialite: "Endocrinologie",
    numeroCNOM: "CNOM-114772", telephone: "+216 55 345 678", matriculeFiscale: "MF-114772",
  },
];

interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password: string) => { ok: boolean; error?: string; role?: UserRole };
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const TOKEN_KEY = "medcity-auth-token";
const REFRESH_TOKEN_KEY = "medcity-refresh-token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  function login(email: string, password: string) {
    const found = MOCK_USERS.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );
    if (!found) return { ok: false, error: "Email ou mot de passe incorrect." };
    const { password: _pw, ...authUser } = found;
    setUser(authUser);
    void loginBackend(email, password);
    return { ok: true, role: authUser.role };
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

async function loginBackend(email: string, password: string) {
  try {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) return;
    const data = (await response.json()) as {
      accessToken?: string;
      refreshToken?: string;
    };
    if (data.accessToken) window.localStorage.setItem(TOKEN_KEY, data.accessToken);
    if (data.refreshToken) window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
  } catch {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
