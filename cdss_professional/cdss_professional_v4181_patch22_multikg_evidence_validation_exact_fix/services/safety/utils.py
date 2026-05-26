from __future__ import annotations

import csv
import os
import sqlite3
import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parents[2]
RUNTIME_SAFETY_SOURCE = '/kaggle/input/datasets/triguiislem/cdss-final-runtime-databases/faiss metadata + /kaggle/input/datasets/triguiislem/cdss-final-runtime-databases/kuzu_build_csv + /kaggle/input/datasets/triguiislem/cdss-final-runtime-databases/sqlite/tn_localization.sqlite'
FALLBACK_SAFETY_SOURCE = 'built_in_minimum_guardrails'
MERGED_SAFETY_SOURCE = RUNTIME_SAFETY_SOURCE + ' + built-in minimum guardrails'

BASELINE_GUARDRAILS: dict[str, Any] = {
    'ddi_pairs': [
        {
            'med_a': 'ibuprofen',
            'med_b': 'warfarin',
            'severity': 'critical',
            'blocked': True,
            'message': 'Ibuprofen with warfarin may increase bleeding risk.',
        },
        {
            'med_a': 'paracetamol',
            'med_b': 'warfarin',
            'severity': 'warning',
            'blocked': False,
            'message': 'Frequent paracetamol use may affect INR monitoring with warfarin.',
        },
    ],
    'pregnancy': {
        'blocked': ['isotretinoin', 'warfarin'],
        'caution': ['ibuprofen'],
        'safe_examples': ['paracetamol'],
    },
    'renal': {
        'blocked': ['ibuprofen', 'diclofenac'],
        'caution': ['metformin'],
    },
    'hepatic': {
        'caution': ['paracetamol'],
        'max_daily_dose_mg': {'paracetamol': 3000},
    },
    'contraindications': {
        'peptic ulcer': ['ibuprofen'],
        'asthma': ['ibuprofen'],
        'chronic liver disease': ['paracetamol'],
        'anticoagulation': ['ibuprofen'],
    },
    'allergy_classes': {
        'penicillin': ['amoxicillin', 'flucloxacillin', 'penicillin'],
        'nsaid': ['ibuprofen', 'diclofenac', 'naproxen'],
    },
    'dose_frequency_map': {
        'once daily': 1,
        'daily': 1,
        'every 24 hours': 1,
        'twice daily': 2,
        'every 12 hours': 2,
        'bid': 2,
        'three times daily': 3,
        'every 8 hours': 3,
        'tid': 3,
        'four times daily': 4,
        'every 6 hours': 4,
        'qid': 4,
    },
}


def normalize_token(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or '').strip().lower())


def parse_first_number(text: str) -> float | None:
    match = re.search(r"(\d+(?:\.\d+)?)", str(text or ''))
    return float(match.group(1)) if match else None


def safety_source_label() -> str:
    return MERGED_SAFETY_SOURCE


def _load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        return {}


def _merge_unique(base: list[str], extra: set[str]) -> list[str]:
    values = {normalize_token(x) for x in base if normalize_token(x)}
    values.update(extra)
    return sorted(values)


@lru_cache(maxsize=1)
def load_rules() -> dict:
    """Load deterministic safety guardrails.

    The rule set is intentionally conservative. It combines:
    - runtime Tunisia signals extracted from KG/VS/AMM exports;
    - a small local guardrail fallback for classic high-risk examples.

    The built-in minimum guardrails are intentionally small and conservative.
    They replace placeholder JSON stubs while keeping the runtime safe when
    richer pharmacist-validated knowledge sources are not yet imported.
    """
    merged: dict[str, Any] = json.loads(json.dumps(BASELINE_GUARDRAILS))

    runtime_vs = Path(os.environ.get('EVIDENCE_METADATA_JSONL_PATH') or os.environ.get('VECTOR_CORPUS_PATH') or BASE_DIR / 'data' / 'runtime' / 'tn_prescription_evidence_corpus.jsonl')
    if not runtime_vs.exists():
        runtime_vs = Path(os.environ.get('EVIDENCE_METADATA_PATH') or BASE_DIR / 'data' / 'runtime' / 'tn_master_vs_corpus.jsonl')
    vulnerability_terms: set[str] = set()
    caution_terms: set[str] = set()
    contraindication_terms: set[str] = set()
    pregnancy_caution: set[str] = set()
    renal_caution: set[str] = set()
    hepatic_caution: set[str] = set()

    if runtime_vs.exists():
        with runtime_vs.open('r', encoding='utf-8-sig') as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                text = normalize_token(rec.get('text', ''))
                for tag in rec.get('vulnerability_tags', []) or []:
                    tag_norm = normalize_token(tag)
                    if tag_norm:
                        vulnerability_terms.add(tag_norm)
                for field in ('contraindications', 'warnings', 'warning', 'cautions'):
                    value = rec.get(field)
                    if isinstance(value, list):
                        for item in value:
                            norm = normalize_token(item)
                            if norm:
                                caution_terms.add(norm)
                    elif isinstance(value, str) and value.strip():
                        caution_terms.add(normalize_token(value))
                if any(k in text for k in ['grossesse', 'pregnancy', 'enceinte']):
                    pregnancy_caution.update(['ibuprofen', 'diclofenac', 'warfarin'])
                if any(k in text for k in ['renal', 'rénal', 'insuffisance rénale', 'irc']):
                    renal_caution.update(['ibuprofen', 'diclofenac', 'metformin'])
                if any(k in text for k in ['hepatic', 'hépat', 'foie', 'liver']):
                    hepatic_caution.update(['paracetamol'])
                if any(k in text for k in ['contre-indication', 'contraindication']):
                    contraindication_terms.add(text[:180])

    amm = Path(os.environ.get('LOCAL_FORMULARY_CATALOG_PATH') or BASE_DIR / 'data' / 'runtime' / 'tn_master_amm_catalog.csv')
    known_ingredients: set[str] = set()
    needs_review_ingredients: set[str] = set()
    if amm.exists():
        with amm.open('r', encoding='utf-8-sig') as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                dci = normalize_token(row.get('dci', '') or row.get('active_ingredient', '') or row.get('active_ingredient_canonical', ''))
                status = normalize_token(row.get('market_status', ''))
                indication = normalize_token(row.get('indication', ''))
                if dci:
                    known_ingredients.add(dci)
                if dci and ('needs_review' in status or not indication):
                    needs_review_ingredients.add(dci)
    else:
        sqlite_db = Path(os.environ.get('LOCALIZATION_DB_PATH') or os.environ.get('TN_LOCALIZATION_SQLITE_PATH') or '')
        if sqlite_db.exists():
            try:
                con = sqlite3.connect(str(sqlite_db))
                con.row_factory = sqlite3.Row
                tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
                if 'medicines' in tables:
                    cols = [r[1] for r in con.execute('PRAGMA table_info(medicines)').fetchall()]
                    dci_cols = [c for c in cols if any(k in c.lower() for k in ['dci', 'ingredient', 'substance'])]
                    if dci_cols:
                        for row in con.execute('SELECT * FROM medicines'):
                            data = dict(row)
                            dci = next((normalize_token(data.get(c, '')) for c in dci_cols if normalize_token(data.get(c, ''))), '')
                            if dci:
                                known_ingredients.add(dci)
                con.close()
            except Exception:
                pass

    dosing = Path(os.environ.get('DCI_DOSING_RULES_PATH') or BASE_DIR / 'data' / 'runtime' / 'tn_dci_dosing_rules.csv')
    if dosing.exists():
        with dosing.open('r', encoding='utf-8-sig') as fh:
            reader = csv.DictReader(fh)
            max_daily = dict(merged.get('hepatic', {}).get('max_daily_dose_mg', {}))
            for row in reader:
                dci = normalize_token(row.get('dci', ''))
                max_text = normalize_token(row.get('adult_max_daily_dose', ''))
                num = parse_first_number(max_text)
                if dci and num is not None and 'mg' in max_text:
                    max_daily[dci] = num
            hepatic = dict(merged.get('hepatic', {}))
            hepatic['max_daily_dose_mg'] = max_daily
            merged['hepatic'] = hepatic

    kg = Path(os.environ.get('KG_RELATIONS_CSV_PATH') or os.environ.get('KG_CATALOG_PATH') or BASE_DIR / 'data' / 'runtime' / 'tn_master_kg_edges.csv')
    emergency_terms = {normalize_token(x) for x in merged.get('emergency_terms', [])}
    review_terms = {normalize_token(x) for x in merged.get('review_terms', [])}
    if kg.exists():
        with kg.open('r', encoding='utf-8-sig') as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                route = normalize_token(row.get('route', '') or row.get('final_state', ''))
                disease = normalize_token(row.get('disease', '') or row.get('condition', ''))
                line = normalize_token(row.get('line', ''))
                if disease and route == 'emergency':
                    emergency_terms.add(disease)
                if disease and route == 'review':
                    review_terms.add(disease)
                if 'contraindications=' in line or 'interactions=' in line or 'renal/hepatic' in line:
                    caution_terms.add(disease or line[:80])

    merged['runtime_vulnerability_tags'] = sorted(vulnerability_terms)
    merged['runtime_caution_terms'] = sorted(caution_terms)
    merged['runtime_contraindication_terms'] = sorted(contraindication_terms)
    merged['known_runtime_dci'] = sorted(known_ingredients)
    merged['runtime_needs_review_dci'] = sorted(needs_review_ingredients)
    merged['emergency_terms'] = sorted(emergency_terms)
    merged['review_terms'] = sorted(review_terms)

    pregnancy = dict(merged.get('pregnancy', {}))
    pregnancy['caution'] = _merge_unique(pregnancy.get('caution', []), pregnancy_caution)
    merged['pregnancy'] = pregnancy

    renal = dict(merged.get('renal', {}))
    renal['caution'] = _merge_unique(renal.get('caution', []), renal_caution)
    merged['renal'] = renal

    hepatic = dict(merged.get('hepatic', {}))
    hepatic['caution'] = _merge_unique(hepatic.get('caution', []), hepatic_caution)
    merged['hepatic'] = hepatic

    merged.setdefault('dose_frequency_map', {})
    merged['_source'] = safety_source_label()
    merged['_fallback_source'] = FALLBACK_SAFETY_SOURCE
    return merged


def infer_daily_frequency(frequency_text: str) -> float | None:
    rules = load_rules().get('dose_frequency_map', {})
    normalized = normalize_token(frequency_text)
    for key, value in rules.items():
        if key in normalized:
            return float(value)
    if any(k in normalized for k in ['once daily', '1/day', 'daily', 'every day', 'chaque jour']):
        return 1.0
    if any(k in normalized for k in ['twice daily', '2/day', 'bid', '2 fois']):
        return 2.0
    if any(k in normalized for k in ['three times', '3/day', 'tid', '3 fois']):
        return 3.0
    if any(k in normalized for k in ['every 6 hour', 'q6h']):
        return 4.0
    if any(k in normalized for k in ['every 8 hour', 'q8h']):
        return 3.0
    if 'as needed' in normalized or 'prn' in normalized:
        return None
    return None
