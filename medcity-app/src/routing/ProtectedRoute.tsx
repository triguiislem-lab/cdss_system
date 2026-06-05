import { useAuth, type UserRole } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { LoadingState } from "@/components/molecules/LoadingState";

interface Props {
  children: ReactNode;
  requiredRole?: UserRole;
}

export function ProtectedRoute({ children, requiredRole }: Props) {
  const { isAuthenticated, isAuthLoading, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      setLocation("/login");
    } else if (requiredRole && user?.role !== requiredRole) {
      setLocation(user?.role === "admin" ? "/admin" : "/doctor");
    }
  }, [isAuthenticated, isAuthLoading, user, requiredRole, setLocation]);

  if (isAuthLoading) {
    return (
      <div className="p-4 lg:p-8">
        <LoadingState title="Chargement session" subtitle="Verification de votre acces..." />
      </div>
    );
  }
  if (!isAuthenticated) return null;
  if (requiredRole && user?.role !== requiredRole) return null;

  return <>{children}</>;
}
