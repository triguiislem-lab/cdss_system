from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class SafetyFinding(BaseModel):
    severity: Literal["info", "warning", "critical"]
    category: str
    message: str
    blocked: bool = False
    medication: str | None = None
    rule_id: str | None = None
    evidence_source: str | None = None
    recommended_action: str | None = None


class SafetyReport(BaseModel):
    findings: list[SafetyFinding] = Field(default_factory=list)

    @property
    def has_blocking_issue(self) -> bool:
        return any(f.blocked for f in self.findings)

    @property
    def critical_count(self) -> int:
        return sum(1 for f in self.findings if f.severity == "critical")

    @property
    def warning_count(self) -> int:
        return sum(1 for f in self.findings if f.severity == "warning")

    def grouped(self) -> dict[str, list[SafetyFinding]]:
        grouped: dict[str, list[SafetyFinding]] = {}
        for finding in self.findings:
            grouped.setdefault(finding.category, []).append(finding)
        return grouped
