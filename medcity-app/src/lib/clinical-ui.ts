import type { Severity, RiskLevel, PrescriptionStatus } from "./mock-data";

export const severityMeta: Record<Severity, { label: string; bg: string; text: string; border: string; dot: string; ring: string }> = {
  critical: { label: "Critical", bg: "bg-critical-soft", text: "text-critical", border: "border-critical/30", dot: "bg-critical", ring: "ring-critical/40" },
  major:    { label: "Major",    bg: "bg-warning-soft",  text: "text-warning-foreground", border: "border-warning/40", dot: "bg-warning", ring: "ring-warning/40" },
  moderate: { label: "Moderate", bg: "bg-warning-soft",  text: "text-warning-foreground", border: "border-warning/30", dot: "bg-warning/80", ring: "ring-warning/30" },
  minor:    { label: "Minor",    bg: "bg-info-soft",     text: "text-info",   border: "border-info/30",     dot: "bg-info",    ring: "ring-info/30" },
  info:     { label: "Info",     bg: "bg-success-soft",  text: "text-success",border: "border-success/30",  dot: "bg-success", ring: "ring-success/30" },
};

export const severityOrder: Severity[] = ["critical", "major", "moderate", "minor", "info"];

export const riskMeta: Record<RiskLevel, { label: string; cls: string }> = {
  high:   { label: "High risk",   cls: "bg-critical-soft text-critical border-critical/30" },
  medium: { label: "Medium risk", cls: "bg-warning-soft text-warning-foreground border-warning/30" },
  low:    { label: "Low risk",    cls: "bg-success-soft text-success border-success/30" },
};

export const statusMeta: Record<PrescriptionStatus, { label: string; cls: string }> = {
  draft:          { label: "Draft",          cls: "bg-muted text-muted-foreground border-border" },
  pending_review: { label: "Pending review", cls: "bg-info-soft text-info border-info/30" },
  validated:      { label: "Validated",      cls: "bg-success-soft text-success border-success/30" },
  rejected:       { label: "Rejected",       cls: "bg-critical-soft text-critical border-critical/30" },
  needs_data:     { label: "Needs data",     cls: "bg-warning-soft text-warning-foreground border-warning/30" },
};
