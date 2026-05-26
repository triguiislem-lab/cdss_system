from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class BusinessRuleRegistry:
    """Lightweight registry for auditable business rule metadata.

    The RouteDecisionEngine executes Python policies because they combine many
    structured signals, but every rule has external metadata for audit, docs and
    future migration to declarative rules.
    """

    def __init__(self, path: str | Path = "config/business_policy_rules.json"):
        self.path = Path(path)
        self._rules: dict[str, dict[str, Any]] = {}
        if self.path.exists():
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            self._rules = {str(r.get("rule_id")): r for r in raw if r.get("rule_id")}

    def get(self, rule_id: str) -> dict[str, Any]:
        return dict(self._rules.get(rule_id, {"rule_id": rule_id, "status": "unregistered"}))

    def explain_many(self, rule_ids: list[str]) -> list[dict[str, Any]]:
        return [self.get(rid) for rid in rule_ids]


# Patch21 documentation hook for allergy/contraindication business rule.
PATCH21_BUSINESS_RULE_NOTES = {
    "DOMAIN_TRUE_CONTRAINDICATION_BLOCKS_GENERATION": "Confirmed positive contraindication or allergy evidence blocks draft generation; negated or unknown allergy evidence never creates a forbidden ingredient."
}
