from __future__ import annotations

import csv
import json
import os
import sqlite3
from functools import lru_cache
from pathlib import Path

from services.safety.utils import normalize_token


class VEIMapper:
    """Runtime reimbursement / review-note mapper.

    The current Tunisia AMM export does not expose a complete reimbursement table.
    This mapper therefore does not invent reimbursement status. Instead, it derives
    conservative review notes from runtime AMM market-status and indication fields,
    and only augments them with explicit runtime reimbursement notes if such a
    real data file is present.
    """

    @lru_cache(maxsize=1)
    def _load(self) -> dict[str, str]:
        root = Path(__file__).resolve().parents[2]
        notes: dict[str, str] = {}

        amm_path = Path(os.environ.get('LOCAL_FORMULARY_CATALOG_PATH') or root / 'data' / 'runtime' / 'tn_master_amm_catalog.csv')
        if amm_path.exists():
            with amm_path.open('r', encoding='utf-8-sig') as fh:
                reader = csv.DictReader(fh)
                for row in reader:
                    product = row.get('brand_name') or row.get('product_name') or row.get('nom_commercial') or ''
                    product_key = normalize_token(product)
                    if not product_key:
                        continue
                    status = normalize_token(row.get('market_status', ''))
                    indication = normalize_token(row.get('indication', ''))
                    derived: list[str] = []
                    if 'needs_review' in status:
                        derived.append('AMM row marked needs_review; verify local availability and regulatory status before final approval.')
                    if not indication:
                        derived.append('No indication text in AMM runtime export; require clinician/pharmacist confirmation.')
                    if derived:
                        notes[product_key] = ' '.join(derived)

        runtime_json_path = Path(os.environ.get('TN_REIMBURSEMENT_NOTES_PATH') or root / 'data' / 'runtime' / 'tn_reimbursement_notes.json')
        if runtime_json_path.exists():
            try:
                curated = json.loads(runtime_json_path.read_text(encoding='utf-8'))
            except json.JSONDecodeError:
                curated = {}
            for product, note in curated.items():
                key = normalize_token(product)
                if key and str(note).strip():
                    existing = notes.get(key, "")
                    notes[key] = " ".join(part for part in [existing, str(note).strip()] if part).strip()
        return notes

    def get_note(self, product_name: str) -> str | None:
        return self._load().get(normalize_token(product_name))
