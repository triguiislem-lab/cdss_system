import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import {
  Activity,
  Bell,
  Building2,
  CalendarClock,
  ClipboardCheck,
  FileText,
  FilePlus2,
  GitPullRequest,
  LayoutDashboard,
  LogOut,
  Pill,
  ScrollText,
  Search,
  Settings,
  Stethoscope,
  UserCheck,
  Users,
} from "lucide-react";

type NavItem = {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

const WORKSPACE_NAV: NavItem[] = [
  { href: "/admin", labelKey: "nav.dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/patients", labelKey: "nav.patients", icon: Users },
  { href: "/admin/cdss/consultations", labelKey: "nav.consultations", icon: CalendarClock },
  { href: "/admin/cdss/prescription/new", labelKey: "nav.newPrescription", icon: FilePlus2 },
  { href: "/admin/cdss/prescription/review", labelKey: "nav.prescriptionReview", icon: ClipboardCheck },
  { href: "/admin/cdss/pharmacy", labelKey: "nav.pharmacy", icon: Building2 },
  { href: "/admin/cdss/medicines", labelKey: "nav.medicines", icon: Pill },
  { href: "/admin/cdss/medicine-contributions", labelKey: "nav.contributions", icon: GitPullRequest },
  { href: "/admin/cdss/interactions", labelKey: "nav.interactions", icon: Activity },
  { href: "/admin/cdss/audit", labelKey: "nav.audit", icon: ScrollText },
  { href: "/admin/cdss/settings", labelKey: "nav.settings", icon: Settings },
];

const PLATFORM_NAV: NavItem[] = [
  { href: "/admin/doctors", labelKey: "nav.doctors", icon: UserCheck },
  { href: "/admin/cms", labelKey: "nav.cms", icon: FileText },
];

function SidebarSection({
  titleKey,
  items,
  location,
}: {
  titleKey: string;
  items: NavItem[];
  location: string;
}) {
  const { t } = useI18n();

  return (
    <div>
      <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t(titleKey)}
      </div>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = item.exact
            ? location === item.href
            : location === item.href || location.startsWith(item.href + "/");

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-smooth",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                )}
              >
                <item.icon
                  className={cn(
                    "h-4 w-4",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                />
                {t(item.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MobileNav({ location }: { location: string }) {
  const { t } = useI18n();

  return (
    <nav className="lg:hidden border-b border-border bg-card overflow-x-auto scrollbar-thin">
      <ul className="flex items-center gap-1 px-3 py-2 whitespace-nowrap">
        {[...WORKSPACE_NAV, ...PLATFORM_NAV].map((item) => {
          const active = item.exact
            ? location === item.href
            : location === item.href || location.startsWith(item.href + "/");

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-smooth",
                  active
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {t(item.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const initials =
    user?.nom
      .split(" ")
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "AD";

  function handleLogout() {
    logout();
    setLocation("/login");
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-card">
            <Stethoscope className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-semibold tracking-tight">MedCity Connect</div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              MedCity Admin
            </div>
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
          <SidebarSection titleKey="nav.workspace" items={WORKSPACE_NAV} location={location} />
          <div className="mt-4">
            <SidebarSection titleKey="nav.platform" items={PLATFORM_NAV} location={location} />
          </div>
        </nav>

        <div className="shrink-0 border-t border-sidebar-border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary-soft text-primary flex items-center justify-center font-semibold text-sm">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{user?.nom ?? "Administrator"}</div>
              <div className="text-xs text-muted-foreground truncate">MedCity administration</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm font-medium hover:bg-muted transition-smooth"
          >
            <LogOut className="h-4 w-4" />
            {t("nav.logout")}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-background/85 backdrop-blur px-4 lg:px-8">
          <div className="lg:hidden flex items-center gap-2 font-semibold">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Stethoscope className="h-4 w-4" />
            </span>
            MedCity Connect
          </div>
          <div className="hidden md:flex flex-1 max-w-xl items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            <input
              placeholder={t("layout.searchPlaceholder")}
              className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden md:inline-flex rounded border border-border px-1.5 py-0.5 text-[10px] font-mono">
              /
            </kbd>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-card hover:bg-muted transition-smooth"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute -top-1 -right-1 h-4 min-w-[16px] rounded-full bg-critical px-1 text-[10px] font-semibold text-critical-foreground flex items-center justify-center animate-pulse-critical">
                2
              </span>
            </button>
          </div>
        </header>

        <MobileNav location={location} />

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

