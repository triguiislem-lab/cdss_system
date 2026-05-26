from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Iterable

from libs.contracts.ingestion import IngestionJobResult


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def project_path(*parts: str) -> Path:
    return PROJECT_ROOT.joinpath(*parts)


def count_csv_rows(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open('r', encoding='utf-8-sig') as fh:
        reader = csv.reader(fh)
        rows = list(reader)
    return max(0, len(rows) - 1)


def count_jsonl_rows(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open('r', encoding='utf-8-sig') as fh:
        return sum(1 for line in fh if line.strip())


def count_json_items(path: Path) -> int:
    if not path.exists():
        return 0
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        return 0
    if isinstance(data, list):
        return len(data)
    if isinstance(data, dict):
        return len(data)
    return 1


def result_from_runtime_file(job_name: str, path: Path, note: str, required_columns: Iterable[str] | None = None) -> IngestionJobResult:
    if not path.exists():
        return IngestionJobResult(job_name=job_name, status='error', notes=[f'Missing runtime source: {path}'])
    suffix = path.suffix.lower()
    if suffix == '.csv':
        records = count_csv_rows(path)
        missing: list[str] = []
        if required_columns:
            with path.open('r', encoding='utf-8-sig') as fh:
                reader = csv.DictReader(fh)
                cols = {str(c).strip().lower() for c in (reader.fieldnames or [])}
            missing = [col for col in required_columns if col.lower() not in cols]
        if missing:
            return IngestionJobResult(job_name=job_name, status='error', records_seen=records, notes=[f'Missing required columns: {missing}', str(path)])
    elif suffix == '.jsonl':
        records = count_jsonl_rows(path)
    elif suffix == '.json':
        records = count_json_items(path)
    else:
        records = 1
    status = 'ok' if records > 0 else 'warning'
    return IngestionJobResult(
        job_name=job_name,
        status=status,
        records_seen=records,
        records_written=records,
        notes=[note, f'Runtime source: {path.name}'],
    )


# Backward-compatible aliases for older tests/imports.
def fixture_path(*parts: str) -> Path:
    return project_path(*parts)


def result_from_file(job_name: str, path: Path, note: str) -> IngestionJobResult:
    return result_from_runtime_file(job_name, path, note)
