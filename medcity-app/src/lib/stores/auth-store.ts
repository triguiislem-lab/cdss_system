import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  email: string;
  name: string;
  role: "doctor" | "admin";
  initials: string;
  specialty?: string;
}

interface AuthState {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => void;
}

// Demo accounts (frontend-only mock auth)
const DEMO_ACCOUNTS: Record<string, { password: string; user: AuthUser }> = {
  "doctor@medcity.tn": {
    password: "demo1234",
    user: { email: "doctor@medcity.tn", name: "Dr. Jordan Chen", role: "doctor", initials: "JC", specialty: "Internal Medicine" },
  },
  "admin@medcity.tn": {
    password: "admin1234",
    user: { email: "admin@medcity.tn", name: "Dr. Amira Ben Salah", role: "admin", initials: "AB", specialty: "Administration" },
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      login: async (email, password) => {
        await new Promise((r) => setTimeout(r, 400));
        const acc = DEMO_ACCOUNTS[email.toLowerCase().trim()];
        if (!acc || acc.password !== password) {
          return { ok: false, error: "Invalid email or password." };
        }
        set({ user: acc.user });
        return { ok: true };
      },
      logout: () => set({ user: null }),
    }),
    { name: "medcity-connect-auth", version: 1 },
  ),
);


