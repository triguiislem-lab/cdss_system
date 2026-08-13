import { Star } from "lucide-react";

export function RatingStars({
  rating,
  className = "",
  sizeClassName = "h-3.5 w-3.5",
}: {
  rating: number;
  className?: string;
  sizeClassName?: string;
}) {
  const normalized = Math.max(0, Math.min(5, Number(rating) || 0));

  return (
    <div className={`flex items-center gap-0.5 ${className}`} aria-label={`${normalized.toFixed(1)} / 5`}>
      {Array.from({ length: 5 }, (_, index) => {
        const fillPercent = Math.max(0, Math.min(1, normalized - index)) * 100;
        return (
          <span key={index} className={`relative inline-flex ${sizeClassName}`} aria-hidden="true">
            <Star className={`${sizeClassName} text-muted-foreground/30`} />
            {fillPercent > 0 && (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fillPercent}%` }}>
                <Star className={`${sizeClassName} fill-amber-400 text-amber-400`} />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
