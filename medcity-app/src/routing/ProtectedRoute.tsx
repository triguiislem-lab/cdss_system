import { useAuth, type UserRole } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import type { ReactNode } from "react";
import { useEffect } from "react";

interface Props {
  children: ReactNode;
  requiredRole?: UserRole;
}

export function ProtectedRoute({ children, requiredRole }: Props) {
  const { isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
    } else if (requiredRole && user?.role !== requiredRole) {
      setLocation(user?.role === "admin" ? "/admin" : "/doctor");
    }
  }, [isAuthenticated, user, requiredRole, setLocation]);

  if (!isAuthenticated) return null;
  if (requiredRole && user?.role !== requiredRole) return null;

  return <>{children}</>;
}
