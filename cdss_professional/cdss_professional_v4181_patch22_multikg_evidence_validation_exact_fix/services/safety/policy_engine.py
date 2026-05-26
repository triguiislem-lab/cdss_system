from __future__ import annotations
import json
from pathlib import Path
from typing import Any
from services.safety.policy_models import SafetyPolicyRule, PolicyDecision, PolicyHit
from services.safety.policy_matchers import extract_text_blob, terms_any, terms_all, groups_all, matched_terms, structured_conditions_ok, normalize_text

DEFAULT_RULES_PATH = Path("config/safety_policy_rules.json")


def _literal_negation_term_present(term: str, blob: str) -> bool:
    """Match explicit negation phrases without applying term_in_blob polarity.

    Rule-level ``negation_terms`` are exceptions such as "pas enceinte" or
    "fonction rénale normale".  They must be detected literally; using the
    positive term matcher would incorrectly suppress them because they are, by
    definition, negated contexts.
    """
    t = normalize_text(term)
    if not t:
        return False
    import re
    pattern = r"(?<![a-z0-9\u0600-\u06FF])" + re.escape(t) + r"(?![a-z0-9\u0600-\u06FF])"
    return re.search(pattern, blob) is not None

class SafetyPolicyEngine:
    def __init__(self, rules_path: str | Path | None = None, rules: list[dict[str, Any]] | None = None):
        self.rules_path = Path(rules_path) if rules_path else DEFAULT_RULES_PATH
        raw = rules if rules is not None else (json.loads(self.rules_path.read_text(encoding="utf-8")) if self.rules_path.exists() else [])
        self.rules = [SafetyPolicyRule(**r) for r in raw if r.get("status", "active") == "active"]
        self.rules.sort(key=lambda r: r.priority, reverse=True)

    def evaluate(self, snapshot, medical_orders=None) -> PolicyDecision:
        blob = extract_text_blob(snapshot, medical_orders=medical_orders)
        hits = []
        for rule in self.rules:
            hit = self._match_rule(rule, snapshot, blob, medical_orders=medical_orders)
            if hit:
                hits.append(hit)
        if not hits:
            return PolicyDecision(has_blocking_policy=False, policy_hits=[])
        hits.sort(key=lambda h: h.priority, reverse=True)
        top = hits[0]
        blocking = top.route_override in {"review", "emergency", "non_pharma", "blocked"} or top.allowed_to_generate is False
        return PolicyDecision(
            has_blocking_policy=blocking,
            route_override=top.route_override,
            allowed_to_generate=top.allowed_to_generate,
            localization_required=False if blocking else True,
            reason_code=top.rule_id,
            severity=top.severity,
            forbidden_ingredients=list(dict.fromkeys([x for h in hits for x in h.forbidden_ingredients])),
            required_missing_data=list(dict.fromkeys([x for h in hits for x in h.required_missing_data])),
            safety_explanation=top.safety_explanation,
            policy_hits=hits,
        )

    def _match_rule(self, rule: SafetyPolicyRule, snapshot, blob: str, medical_orders=None):
        t = rule.trigger
        if t.negation_terms and any(_literal_negation_term_present(term, blob) for term in t.negation_terms):
            return None
        if not structured_conditions_ok(t.structured_conditions, snapshot, blob, medical_orders=medical_orders):
            return None
        if t.text_terms_any and not terms_any(t.text_terms_any, blob):
            return None
        if t.text_terms_all and not terms_all(t.text_terms_all, blob):
            return None
        if t.text_terms_group_all and not groups_all(t.text_terms_group_all, blob):
            return None
        matched = []
        matched += matched_terms(t.text_terms_any, blob)
        matched += matched_terms(t.text_terms_all, blob)
        for group in t.text_terms_group_all:
            matched += matched_terms(group, blob)
        return PolicyHit(rule_id=rule.rule_id, version=rule.version, category=rule.category, priority=rule.priority, severity=rule.severity, route_override=rule.action.route_override, allowed_to_generate=rule.action.allowed_to_generate, forbidden_ingredients=rule.action.forbidden_ingredients, required_missing_data=rule.action.required_missing_data, safety_explanation=rule.safety_explanation, source_refs=rule.source_refs, audit_tags=rule.audit_tags, matched_terms=list(dict.fromkeys(matched)))
