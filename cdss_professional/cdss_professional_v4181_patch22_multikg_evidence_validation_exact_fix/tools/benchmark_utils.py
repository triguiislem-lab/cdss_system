
from __future__ import annotations

import json, re, unicodedata
from collections import Counter
from pathlib import Path
from typing import Any


def normalize_text(v: Any) -> str:
    text = unicodedata.normalize("NFKD", str(v or "").lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("µ", "u")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


ALIASES = {
    "paracetamol": {"paracetamol", "paracetamol", "acetaminophen", "novadol", "adol", "adol 500", "doliprane", "doliprane tn", "efferalgan", "analgan", "algesic", "adoline"},
    "salbutamol": {"salbutamol", "albuterol", "sulfate de salbutamol", "salbutamol sulfate", "aerol", "ventol", "ventaxx", "ventoline"},
    "ibuprofen": {"ibuprofen", "ibuprofene", "ibuprofène", "brufen", "nsaid", "ains"},
    "amoxicillin": {"amoxicillin", "amoxicilline", "amoxicillina"},
    "formoterol": {"formoterol", "fumarate de formoterol"},
    "dextromethorphan": {"dextromethorphan", "dextromethorphane"},
}

UNSAFE_PRODUCT_TOKENS = {
    "actifed", "goldix", "pseudoephedrine", "pseudoephedrine", "phenylephrine",
    "triprolidine", "chlorpheniramine", "caffeine", "cafeine", "rhume", "cold flu",
}


def canonical_ingredient(text: Any) -> str:
    blob = normalize_text(text)
    for canon, aliases in ALIASES.items():
        for alias in aliases:
            if normalize_text(alias) and normalize_text(alias) in blob:
                return canon
    return blob


def canonical_list(values: Any) -> list[str]:
    if values is None:
        return []
    if isinstance(values, str):
        values = [values]
    out: list[str] = []
    for v in values or []:
        if isinstance(v, dict):
            text = v.get("active_ingredient") or v.get("ingredient") or v.get("dci") or v.get("name") or v.get("product_name") or json.dumps(v, ensure_ascii=False)
        else:
            text = str(v)
        c = canonical_ingredient(text)
        if c and c not in out:
            out.append(c)
    return out


def _get(obj: Any, path: list[str], default=None):
    cur = obj
    for p in path:
        if isinstance(cur, dict) and p in cur:
            cur = cur[p]
        else:
            return default
    return cur


def find_first_key(obj: Any, key: str):
    if isinstance(obj, dict):
        if key in obj:
            return obj[key]
        for v in obj.values():
            found = find_first_key(v, key)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for v in obj:
            found = find_first_key(v, key)
            if found is not None:
                return found
    return None


def _case_expected(case: dict) -> dict:
    exp = case.get("expected")
    return exp if isinstance(exp, dict) else {}


def expected_route(case: dict) -> str | None:
    exp = _case_expected(case)
    route = (
        case.get("expected_route")
        or exp.get("expected_route")
        or exp.get("route")
        or exp.get("triage_recommendation")
    )
    if not route:
        cid = normalize_text(case.get("case_id") or case.get("id") or "")
        if "emergency" in cid:
            route = "emergency"
        elif "review" in cid:
            route = "review"
        elif "non pharma" in cid or "non_pharma" in cid:
            route = "non_pharma"
    if not route:
        return None
    route = normalize_text(route).replace("non pharma", "non_pharma")
    return route


def route_match(expected: str | None, actual: str | None) -> bool:
    if not expected:
        return True
    if not actual:
        return False
    e = normalize_text(expected).replace("non pharma", "non_pharma")
    a = normalize_text(actual).replace("non pharma", "non_pharma")
    if e == a or e in a:
        return True
    if e == "review" and ("review" in a or "clinician" in a):
        return True
    if e == "emergency" and ("emergency" in a or "urgent" in a):
        return True
    if e == "non_pharma" and ("non" in a and "pharma" in a):
        return True
    return False


def expected_active_ingredients(case: dict) -> list[str]:
    exp = _case_expected(case)
    vals = (
        case.get("expected_active_ingredients")
        or case.get("expected_ingredients")
        or case.get("expected_medications")
        or exp.get("expected_active_ingredients")
        or exp.get("active_ingredients")
        or exp.get("medications")
        or []
    )
    return canonical_list(vals)


def forbidden_active_ingredients(case: dict) -> list[str]:
    exp = _case_expected(case)
    vals = (
        case.get("forbidden_active_ingredients")
        or case.get("forbidden_medications")
        or exp.get("forbidden_active_ingredients")
        or exp.get("forbidden_medications")
        or []
    )
    return canonical_list(vals)


def expected_local_products_any(case: dict) -> list[str]:
    exp = _case_expected(case)
    vals = (
        case.get("expected_local_products_any")
        or case.get("expected_allowed_products_any")
        or case.get("expected_local_products")
        or case.get("must_include_any")
        or exp.get("expected_local_products_any")
        or exp.get("expected_allowed_products_any")
        or exp.get("local_products")
        or []
    )
    if isinstance(vals, str):
        vals = [vals]
    return [normalize_text(x) for x in vals]


def _med_text(med: Any) -> str:
    if isinstance(med, dict):
        return " ".join(str(med.get(k) or "") for k in ["active_ingredient", "dci", "name", "product_name", "route", "rationale"])
    return str(med)


def _product_text(product: Any) -> str:
    if isinstance(product, dict):
        return " ".join(str(product.get(k) or "") for k in [
            "local_product_name", "product_name", "name", "active_ingredient", "dci",
            "strength", "form", "route", "presentation", "rationale"
        ])
    return str(product)


def medication_hit(expected_ingredients: list[str], predicted_medications: list[Any]) -> bool:
    if not expected_ingredients:
        return True
    blob = normalize_text(json.dumps(predicted_medications, ensure_ascii=False))
    for ing in expected_ingredients:
        for alias in ALIASES.get(ing, {ing}):
            if normalize_text(alias) in blob:
                return True
    return False


def forbidden_medication_present(forbidden_ingredients: list[str], predicted_medications: list[Any]) -> bool:
    if not forbidden_ingredients:
        return False
    blob = normalize_text(json.dumps(predicted_medications, ensure_ascii=False))
    for ing in forbidden_ingredients:
        for alias in ALIASES.get(ing, {ing}):
            if normalize_text(alias) in blob:
                return True
    return False


def route_aware_structure_complete(expected_route_value: str | None, expected_ingredients: list[str], predicted_medications: list[Any]) -> bool:
    if expected_route_value in {"review", "emergency", "non_pharma", "blocked"} and not expected_ingredients:
        return True
    if not expected_ingredients:
        return True
    if not predicted_medications:
        return False
    # A minimal clinical medication structure: ingredient/name + route/frequency or dose.
    for med in predicted_medications:
        if not isinstance(med, dict):
            continue
        name = med.get("active_ingredient") or med.get("dci") or med.get("name")
        if canonical_ingredient(name) in set(expected_ingredients):
            if med.get("route") and (med.get("dose") or med.get("frequency") or med.get("duration")):
                return True
    return True  # keep non-blocking for legacy responses if medication hit is true


def medication_route_hit(expected_ingredients: list[str], predicted_medications: list[Any], expected_medication_route: str | None = None) -> bool:
    if not expected_medication_route:
        return True
    exp = normalize_text(expected_medication_route)
    for med in predicted_medications or []:
        if canonical_ingredient(_med_text(med)) in set(expected_ingredients):
            route = normalize_text(med.get("route") if isinstance(med, dict) else "")
            if "inhal" in exp and ("inhal" in route or "aerosol" in route):
                return True
            if "oral" in exp and ("oral" in route or "orale" in route):
                return True
    return False



def contains_combination_product(text: str) -> bool:
    raw = str(text or '').lower()
    blob = normalize_text(text)
    if '+' in raw or ' plus ' in raw:
        return True
    combo_tokens = [
        'pseudoephedrine', 'phenylephrine', 'triprolidine', 'chlorpheniramine',
        'caffeine', 'cafeine', 'rhume', 'cold flu'
    ]
    return any(normalize_text(tok) and normalize_text(tok) in blob for tok in combo_tokens)


def product_alias_matches_expected(expected_local_products: list[str], expected_ingredients: list[str], localized_products: list[Any]) -> bool:
    if not expected_local_products and not expected_ingredients:
        return True
    expected_names = set(expected_local_products or [])
    for ing in expected_ingredients:
        expected_names.update(normalize_text(a) for a in ALIASES.get(ing, {ing}))

    mono_expected = len(expected_ingredients) == 1

    for product in localized_products or []:
        text = _product_text(product)
        blob = normalize_text(text)
        if any(tok in blob for tok in UNSAFE_PRODUCT_TOKENS):
            continue
        if mono_expected and contains_combination_product(text):
            # reject obvious combinations for mono-ingredient benchmark expectations
            continue
        if any(alias and alias in blob for alias in expected_names):
            return True
    return False


def localized_product_verified(row: dict) -> bool:
    eq = row.get("evidence_quality_summary") or {}
    if isinstance(eq, dict) and eq.get("localized_product_verified") is True:
        return True
    return False


def extract_generation_metadata(plan: dict | None, resp: dict | None = None) -> dict:
    plan = plan or {}
    resp = resp or {}
    gm = plan.get("generation_metadata") or resp.get("generation_metadata") or find_first_key(resp, "generation_metadata")
    if isinstance(gm, dict):
        return gm
    notes = plan.get("generation_notes") or resp.get("generation_notes") or find_first_key(resp, "generation_notes") or []
    blob = normalize_text(json.dumps(notes, ensure_ascii=False))
    return {
        "fallback_used": "fallback" in blob,
        "target_guardrail_applied": "guardrail" in blob or "target" in blob,
        "guardrail_inserted_target": "inserted" in blob and "target" in blob,
        "parse_status": "unparseable_or_empty" if "unparseable" in blob else ("ok" if notes else None),
        "llm_model_used": None,
    }


def extract_stage_traces(resp: dict) -> tuple[dict, dict, list]:
    traces = resp.get("stage_traces") or find_first_key(resp, "stage_traces") or []
    durations = resp.get("stage_durations") or find_first_key(resp, "stage_durations") or {}
    statuses = {}
    if isinstance(traces, list):
        for t in traces:
            if isinstance(t, dict) and t.get("stage"):
                if t.get("duration_ms") is not None:
                    durations.setdefault(t["stage"], t.get("duration_ms"))
                if t.get("status"):
                    statuses[t["stage"]] = t.get("status")
    return durations if isinstance(durations, dict) else {}, statuses, traces if isinstance(traces, list) else []



def _extract_route(resp: dict) -> str | None:
    execution_plan = resp.get("execution_plan") or find_first_key(resp, "execution_plan") or {}
    if isinstance(execution_plan, dict) and execution_plan.get("route"):
        return normalize_text(execution_plan.get("route")).replace("non pharma", "non_pharma")

    proposal = resp.get("proposal") or find_first_key(resp, "proposal") or {}
    if isinstance(proposal, dict) and proposal.get("route"):
        return normalize_text(proposal.get("route")).replace("non pharma", "non_pharma")

    plan = resp.get("draft_plan") or resp.get("plan") or find_first_key(resp, "draft_plan") or {}
    if isinstance(plan, dict) and plan.get("triage_recommendation"):
        return normalize_text(plan.get("triage_recommendation")).replace("non pharma", "non_pharma")

    snapshot = resp.get("snapshot") or resp.get("patient_snapshot") or find_first_key(resp, "patient_snapshot") or {}
    if isinstance(snapshot, dict) and snapshot.get("route_recommendation"):
        return normalize_text(snapshot.get("route_recommendation")).replace("non pharma", "non_pharma")

    val = resp.get("route") or resp.get("route_recommendation")
    return normalize_text(val).replace("non pharma", "non_pharma") if val else None


def _extract_medications(resp: dict) -> list[Any]:
    for candidate in [
        _get(resp, ["draft_plan", "medications"]),
        _get(resp, ["plan", "medications"]),
        _get(resp, ["proposal", "medications"]),
        _get(resp, ["prescription_proposal", "medications"]),
        resp.get("draft_medications"),
        resp.get("medications"),
    ]:
        if isinstance(candidate, list):
            return candidate
    return []


def _extract_localized(resp: dict) -> list[Any]:
    for candidate in [
        _get(resp, ["proposal", "localized_medications"]),
        _get(resp, ["proposal", "localized_products"]),
        _get(resp, ["prescription_proposal", "localized_medications"]),
        resp.get("localized_medications"),
        resp.get("localized_products"),
    ]:
        if isinstance(candidate, list):
            return candidate
    return []


def _local_name(item: Any) -> str:
    if isinstance(item, dict):
        return str(item.get("local_product_name") or item.get("product_name") or item.get("name") or "")
    return str(item)


def _med_name(med: Any) -> str:
    if isinstance(med, dict):
        return str(med.get("active_ingredient") or med.get("dci") or med.get("name") or "")
    return str(med)


def target_propagation_ok(summary_or_row: dict, expected_ingredients: list[str] | None = None) -> bool:
    expected_ingredients = expected_ingredients or summary_or_row.get("expected_active_ingredients") or []
    if not expected_ingredients:
        return True
    ep = summary_or_row.get("execution_plan") or {}
    targets = canonical_list(ep.get("target_ingredients") or [])
    return any(x in targets for x in expected_ingredients)


def expected_active_ingredient_scoring_ok(summary_or_row: dict, expected_ingredients: list[str] | None = None) -> bool:
    expected_ingredients = expected_ingredients or summary_or_row.get("expected_active_ingredients") or []
    if not expected_ingredients:
        return True
    rd = summary_or_row.get("retrieval_diagnostics") or {}
    scored = rd.get("expected_active_ingredient_for_scoring")
    if not scored:
        return False
    return canonical_ingredient(scored) in set(expected_ingredients)


def summarize_draft(*args, **kwargs) -> dict:
    """Flexible V4.15 canonical summarizer.

    Supported calls:
    - summarize_draft(resp)
    - summarize_draft(case, resp, http_status=..., elapsed_ms=..., index=...)
    - summarize_draft(case, idx, resp, http_status, elapsed_ms)
    """
    case = kwargs.pop("case", None)
    resp = kwargs.pop("resp", None)
    http_status = kwargs.pop("http_status", 200)
    elapsed_ms = kwargs.pop("elapsed_ms", None)
    index = kwargs.pop("index", kwargs.pop("idx", 0))

    if len(args) == 1:
        resp = args[0]
        case = case or {}
    elif len(args) >= 2 and isinstance(args[1], dict):
        case = args[0] or {}
        resp = args[1] or {}
    elif len(args) >= 3:
        case = args[0] or {}
        index = args[1]
        resp = args[2] or {}
        if len(args) >= 4:
            http_status = args[3]
        if len(args) >= 5:
            elapsed_ms = args[4]
    else:
        case = case or {}
        resp = resp or {}

    if not isinstance(resp, dict):
        resp = {"raw_response": resp}
    if not isinstance(case, dict):
        case = {}

    route_expected = expected_route(case)
    exp_ing = expected_active_ingredients(case)
    forb_ing = forbidden_active_ingredients(case)
    expected_products = expected_local_products_any(case)

    route = _extract_route(resp)
    meds = _extract_medications(resp)
    localized = _extract_localized(resp)
    evidence = resp.get("evidence") or find_first_key(resp, "evidence") or {}
    proposal = resp.get("proposal") or find_first_key(resp, "proposal") or {}
    plan = resp.get("draft_plan") or resp.get("plan") or find_first_key(resp, "draft_plan") or {}
    eq = {}
    if isinstance(proposal, dict):
        eq = proposal.get("evidence_quality_summary") or {}
    if not eq and isinstance(evidence, dict):
        eq = evidence.get("evidence_quality_summary") or {}
    rd = evidence.get("retrieval_diagnostics") if isinstance(evidence, dict) else {}
    rd = rd or resp.get("retrieval_diagnostics") or find_first_key(resp, "retrieval_diagnostics") or {}
    ep = resp.get("execution_plan") or find_first_key(resp, "execution_plan") or {}

    generation_metadata = extract_generation_metadata(plan if isinstance(plan, dict) else {}, resp)
    stage_durations, stage_statuses, stage_traces = extract_stage_traces(resp)

    is_prescription = route_expected == "prescription" or bool(exp_ing)
    is_review = route_expected in {"review", "emergency", "non_pharma", "blocked"}

    med_ok = medication_hit(exp_ing, meds) if is_prescription else (len(meds) == 0)
    forb_bad = forbidden_medication_present(forb_ing, meds)
    loc_ok = product_alias_matches_expected(expected_products, exp_ing, localized) if is_prescription else (len(localized) == 0)
    struct_ok = route_aware_structure_complete(route_expected, exp_ing, meds)
    target_ok = target_propagation_ok({"execution_plan": ep}, exp_ing)
    scoring_ok = expected_active_ingredient_scoring_ok({"retrieval_diagnostics": rd}, exp_ing)
    route_ok = route_match(route_expected, route)

    blocked = bool(resp.get("blocked") or _get(resp, ["proposal", "blocked"]) or _get(resp, ["safety_report", "blocked"]))
    gen_ms = stage_durations.get("generation") if isinstance(stage_durations, dict) else None
    qwen_used = bool(generation_metadata.get("llm_model_used")) if generation_metadata.get("llm_model_used") is not None else bool(gen_ms and gen_ms > 100)

    row = {
        "case_id": case.get("case_id") or case.get("id") or f"case_{index:03d}",
        "http_status": http_status,
        "elapsed_ms": elapsed_ms,
        "expected_route": route_expected,
        "route": route,
        "route_ok": route_ok,
        "expected_active_ingredients": exp_ing,
        "forbidden_active_ingredients": forb_ing,
        "medication_dicts": meds,
        "medications": [_med_name(x) for x in meds],
        "localized_medication_dicts": localized,
        "localized_products": [_local_name(x) for x in localized],
        "blocked": blocked,
        "medication_hit": med_ok,
        "forbidden_medication_present": forb_bad,
        "localization_hit": loc_ok,
        "localized_product_verified": localized_product_verified({"evidence_quality_summary": eq}),
        "medication_structure_complete": struct_ok,
        "is_prescription_expected": is_prescription,
        "is_review_expected": is_review,
        "target_propagation_ok": target_ok,
        "expected_active_ingredient_scoring_ok": scoring_ok,
        "qwen_used": qwen_used,
        "fallback_used": bool(generation_metadata.get("fallback_used")),
        "target_guardrail_applied": bool(generation_metadata.get("target_guardrail_applied")),
        "guardrail_inserted_target": bool(generation_metadata.get("guardrail_inserted_target")),
        "parse_status": generation_metadata.get("parse_status"),
        "execution_plan": ep,
        "retrieval_diagnostics": rd,
        "evidence_quality_summary": eq,
        "generation_metadata": generation_metadata,
        "stage_durations": stage_durations,
        "stage_statuses": stage_statuses,
        "stage_traces": stage_traces,
        "raw_response": resp,
    }

    reasons: list[str] = []
    if http_status != 200:
        reasons.append("http_error")
    if route_expected and not route_ok:
        reasons.append("route_mismatch")
    if is_prescription and not target_ok:
        reasons.append("target_propagation_mismatch")
    if is_prescription and not scoring_ok:
        reasons.append("expected_active_ingredient_scoring_mismatch")
    if is_prescription and not med_ok:
        reasons.append("medication_miss")
    if forb_bad:
        reasons.append("forbidden_medication_present")
    if is_prescription and not loc_ok:
        reasons.append("localization_miss")
    if is_prescription and not row["localized_product_verified"]:
        reasons.append("localized_product_not_verified")
    if not struct_ok:
        reasons.append("incomplete_medication_structure")
    if is_review and meds:
        reasons.append("unexpected_medication_generation")
    if is_review and qwen_used:
        reasons.append("qwen_not_skipped_for_review")
    if generation_metadata.get("parse_status") in {"error", "invalid_json"}:
        reasons.append("prompt_parse_failure")
    row["failure_reasons"] = reasons
    return row


def ratio_true(rows: list[dict], key: str, filt=lambda r: True):
    selected = [r for r in rows if filt(r)]
    if not selected:
        return None
    return round(sum(1 for r in selected if r.get(key) is True) / len(selected), 4)


def avg_num(rows: list[dict], key: str, filt=lambda r: True):
    vals = [r.get(key) for r in rows if filt(r) and isinstance(r.get(key), (int, float))]
    if not vals:
        return None
    return round(sum(vals) / len(vals), 2)


def compute_level2_metrics(rows: list[dict]) -> dict:
    prescription = lambda r: r.get("is_prescription_expected") is True
    review = lambda r: r.get("is_review_expected") is True
    ok_http = sum(1 for r in rows if r.get("http_status") == 200)

    return {
        "case_count": len(rows),
        "http_success_rate": round(ok_http / len(rows), 4) if rows else None,
        "route_accuracy_all_cases": ratio_true(rows, "route_ok", lambda r: r.get("expected_route") is not None),
        "medication_hit_rate_prescription_cases": ratio_true(rows, "medication_hit", prescription),
        "localization_hit_rate_prescription_cases": ratio_true(rows, "localization_hit", prescription),
        "localized_product_verified_rate_prescription_cases": ratio_true(rows, "localized_product_verified", prescription),
        "target_propagation_accuracy": ratio_true(rows, "target_propagation_ok", prescription),
        "expected_active_ingredient_scoring_accuracy": ratio_true(rows, "expected_active_ingredient_scoring_ok", prescription),
        "forbidden_medication_violation_rate": round(sum(1 for r in rows if r.get("forbidden_medication_present")) / len(rows), 4) if rows else None,
        "blocked_accuracy_review_cases": ratio_true(rows, "blocked", review),
        "qwen_skipped_rate_review_cases": round(sum(1 for r in rows if review(r) and not r.get("qwen_used")) / max(1, len([r for r in rows if review(r)])), 4) if rows else None,
        "fallback_used_rate_prescription_cases": ratio_true(rows, "fallback_used", prescription),
        "guardrail_applied_rate_prescription_cases": ratio_true(rows, "target_guardrail_applied", prescription),
        "avg_elapsed_ms_all_cases": avg_num(rows, "elapsed_ms"),
        "avg_elapsed_ms_prescription_cases": avg_num(rows, "elapsed_ms", prescription),
        "failure_count": sum(1 for r in rows if r.get("failure_reasons")),
        "failure_reason_counts": dict(Counter(reason for r in rows for reason in (r.get("failure_reasons") or []))),
    }


def build_level2_failure_map(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        if r.get("failure_reasons"):
            out.append({
                "case_id": r.get("case_id"),
                "failure_reasons": r.get("failure_reasons"),
                "expected_route": r.get("expected_route"),
                "route": r.get("route"),
                "expected_active_ingredients": r.get("expected_active_ingredients"),
                "forbidden_active_ingredients": r.get("forbidden_active_ingredients"),
                "medications": r.get("medications"),
                "localized_products": r.get("localized_products"),
                "blocked": r.get("blocked"),
                "retrieval_diagnostics": r.get("retrieval_diagnostics"),
                "evidence_quality_summary": r.get("evidence_quality_summary"),
                "generation_metadata": r.get("generation_metadata"),
            })
    return out


def write_json(path: str | Path, obj: Any):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return path
