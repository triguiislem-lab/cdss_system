import { Spinner } from "@/components/atoms/spinner";
import { cn } from "@/lib/utils";

type LoadingStateProps = {
  title?: string;
  subtitle?: string;
  className?: string;
};

export function LoadingState({
  title = "Chargement des donnees",
  subtitle = "Synchronisation avec le backend MedCity...",
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-8 text-center shadow-card",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Spinner className="h-5 w-5" />
      </div>
      <div className="mt-4 text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
      <div className="mx-auto mt-5 grid max-w-xs gap-2">
        <div className="h-2 rounded-full bg-primary/10" />
        <div className="mx-auto h-2 w-4/5 rounded-full bg-primary/10" />
        <div className="mx-auto h-2 w-2/3 rounded-full bg-primary/10" />
      </div>
    </div>
  );
}

export function CardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="rounded-xl border border-border bg-card p-5 shadow-card"
        >
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 animate-pulse rounded-full bg-primary/10" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/2 animate-pulse rounded bg-primary/10" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-primary/10" />
            </div>
          </div>
          <div className="mt-5 space-y-2">
            <div className="h-3 animate-pulse rounded bg-primary/10" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-primary/10" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-primary/10" />
          </div>
        </div>
      ))}
    </div>
  );
}
