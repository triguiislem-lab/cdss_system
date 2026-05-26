from __future__ import annotations

import csv
import json
from dataclasses import dataclass, field
import os
from pathlib import Path
from typing import Any


@dataclass
class DeploymentReadinessReport:
    ok: bool
    issues: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    asset_counts: dict[str, int] = field(default_factory=dict)
    approvals: dict[str, bool] = field(default_factory=dict)
    validation_scores: dict[str, float | int | bool] = field(default_factory=dict)


class DeploymentGovernanceService:
    """Validate runtime assets, approvals, and optional validation evidence.

    Clinical deployment requires two separate conditions:
    1. formal approvals are explicitly signed in the governance manifest;
    2. if validation reports are required in the manifest, their measured metrics
       must meet the configured minimum thresholds.
    """

    def __init__(
        self,
        project_root: Path,
        manifest_path: Path | None = None,
        kg_path: Path | None = None,
        vs_path: Path | None = None,
        prescription_evidence_path: Path | None = None,
        amm_path: Path | None = None,
    ) -> None:
        self.project_root = project_root
        self.manifest_path = manifest_path or (project_root / "data" / "governance" / "deployment_approval_manifest.json")
        self.kg_path = kg_path or Path(os.environ.get("KG_RELATIONS_CSV_PATH") or os.environ.get("KG_CATALOG_PATH") or project_root / "data" / "runtime" / "tn_master_kg_edges.csv")
        self.vs_path = vs_path or Path(os.environ.get("EVIDENCE_METADATA_JSONL_PATH") or os.environ.get("VECTOR_CORPUS_PATH") or project_root / "data" / "runtime" / "tn_master_vs_corpus.jsonl")
        self.prescription_evidence_path = prescription_evidence_path or Path(os.environ.get("EVIDENCE_METADATA_JSONL_PATH") or os.environ.get("VECTOR_CORPUS_PATH") or project_root / "data" / "runtime" / "tn_prescription_evidence_corpus.jsonl")
        self.alias_path = Path(os.environ.get("MEDICATION_ALIASES_PATH") or project_root / "data" / "runtime" / "tn_medication_aliases.csv")
        self.safety_profile_path = Path(os.environ.get("DCI_SAFETY_PROFILES_PATH") or project_root / "data" / "runtime" / "tn_dci_safety_profiles.csv")
        self.indication_map_path = Path(os.environ.get("INDICATION_THERAPY_MAP_PATH") or project_root / "data" / "runtime" / "tn_indication_therapy_map.csv")
        self.amm_path = amm_path or Path(os.environ.get("LOCAL_FORMULARY_CATALOG_PATH") or os.environ.get("LOCALIZATION_DB_PATH") or project_root / "data" / "runtime" / "tn_master_amm_catalog.csv")

    def validate(self) -> DeploymentReadinessReport:
        issues: list[str] = []
        warnings: list[str] = []
        asset_counts: dict[str, int] = {}
        validation_scores: dict[str, float | int | bool] = {}

        manifest = self._load_manifest()
        required = manifest.get("required_approvals", {})
        approvals = {k: bool(v) for k, v in required.items()}
        missing_approvals = [key for key, value in approvals.items() if not value]
        if missing_approvals:
            issues.append("Missing deployment approvals: " + ", ".join(sorted(missing_approvals)))

        asset_counts["kg_rows"] = self._count_csv_rows(self.kg_path)
        asset_counts["vs_passages"] = self._count_jsonl_rows(self.vs_path)
        asset_counts["prescription_evidence_rows"] = self._count_jsonl_rows(self.prescription_evidence_path)
        asset_counts["amm_rows"] = self._count_csv_rows(self.amm_path)
        asset_counts["alias_rows"] = self._count_csv_rows(self.alias_path)
        asset_counts["safety_profile_rows"] = self._count_csv_rows(self.safety_profile_path)
        asset_counts["indication_map_rows"] = self._count_csv_rows(self.indication_map_path)

        minimums = manifest.get("minimum_runtime_asset_counts", {})
        for key, count in asset_counts.items():
            if key not in minimums:
                continue
            minimum = int(minimums.get(key, 1))
            if count < minimum:
                issues.append(f"{key} below minimum: {count} < {minimum}")

        asset_key_by_name = {
            "kg": "kg_rows",
            "vs": "vs_passages",
            "prescription_evidence": "prescription_evidence_rows",
            "amm": "amm_rows",
            "aliases": "alias_rows",
            "safety_profiles": "safety_profile_rows",
            "indication_map": "indication_map_rows",
        }
        for name, path in {"kg": self.kg_path, "vs": self.vs_path, "prescription_evidence": self.prescription_evidence_path, "amm": self.amm_path, "aliases": self.alias_path, "safety_profiles": self.safety_profile_path, "indication_map": self.indication_map_path}.items():
            if not path.exists():
                message = f"Missing runtime asset: {name} -> {path}"
                if asset_key_by_name[name] in minimums:
                    issues.append(message)
                else:
                    warnings.append(message)

        schema_issues = self._validate_runtime_asset_schemas()
        issues.extend(schema_issues)

        quality_warnings = self._runtime_data_quality_warnings(manifest)
        warnings.extend(quality_warnings)

        report_config = manifest.get("required_validation_reports", {})
        report_issues, report_warnings, scores = self._validate_reports(report_config)
        issues.extend(report_issues)
        warnings.extend(report_warnings)
        validation_scores.update(scores)

        return DeploymentReadinessReport(
            ok=not issues,
            issues=issues,
            warnings=warnings,
            asset_counts=asset_counts,
            approvals=approvals,
            validation_scores=validation_scores,
        )

    def require_ready(self) -> None:
        report = self.validate()
        if not report.ok:
            joined = "; ".join(report.issues)
            raise RuntimeError("Clinical deployment mode is blocked until governance checks pass: " + joined)

    def _validate_runtime_asset_schemas(self) -> list[str]:
        issues: list[str] = []
        if self.kg_path.exists():
            cols = self._csv_columns(self.kg_path)
            if not cols:
                issues.append("KG CSV has no header columns.")
            elif not any(col in cols for col in {"disease", "condition", "source", "target", "route"}):
                issues.append("KG CSV schema does not expose recognizable disease/route/source columns.")
        if self.amm_path.exists():
            cols = self._csv_columns(self.amm_path)
            if not cols:
                issues.append("AMM CSV has no header columns.")
            elif not any(col in cols for col in {"dci", "substance", "active_ingredient", "product_name", "nom_commercial"}):
                issues.append("AMM CSV schema does not expose recognizable DCI/product columns.")
        if self.vs_path.exists():
            first = self._first_jsonl_record(self.vs_path)
            if not first:
                issues.append("VS JSONL has no readable JSON records.")
            elif not any(key in first for key in {"text", "content", "passage", "chunk_text", "body", "evidence_text"}):
                issues.append("VS JSONL schema does not expose a recognizable text field.")
        return issues


    def _runtime_data_quality_warnings(self, manifest: dict[str, Any]) -> list[str]:
        warnings: list[str] = []
        if not self.amm_path.exists():
            return warnings
        thresholds = manifest.get("runtime_data_quality_thresholds", {}) or {}
        max_needs_review_ratio = float(thresholds.get("max_amm_needs_review_ratio_warning", 0.50))
        max_missing_indication_ratio = float(thresholds.get("max_amm_missing_indication_ratio_warning", 0.75))
        total = 0
        needs_review = 0
        missing_indication = 0
        with self.amm_path.open("r", encoding="utf-8-sig") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                total += 1
                status = str(row.get("market_status", "")).lower()
                indication = str(row.get("indication", "")).strip()
                if "needs_review" in status:
                    needs_review += 1
                if not indication:
                    missing_indication += 1
        if not total:
            return warnings
        needs_review_ratio = needs_review / total
        missing_indication_ratio = missing_indication / total
        if needs_review_ratio > max_needs_review_ratio:
            warnings.append(
                f"AMM catalog quality warning: {needs_review}/{total} rows marked needs_review ({needs_review_ratio:.1%})."
            )
        if missing_indication_ratio > max_missing_indication_ratio:
            warnings.append(
                f"AMM catalog quality warning: {missing_indication}/{total} rows have missing indication ({missing_indication_ratio:.1%})."
            )
        return warnings

    def _validate_reports(self, config: dict[str, Any]) -> tuple[list[str], list[str], dict[str, float | int | bool]]:
        issues: list[str] = []
        warnings: list[str] = []
        scores: dict[str, float | int | bool] = {}
        if not config:
            warnings.append("No validation report requirements configured; approvals remain the primary deployment gate.")
            return issues, warnings, scores

        for name, item in config.items():
            if not item.get("required", False):
                continue
            rel_path = item.get("path")
            if not rel_path:
                issues.append(f"Validation report '{name}' is required but has no path configured.")
                continue
            report_path = self.project_root / str(rel_path)
            if not report_path.exists():
                issues.append(f"Required validation report missing: {name} -> {report_path}")
                continue
            try:
                report = json.loads(report_path.read_text(encoding="utf-8"))
            except Exception as exc:
                issues.append(f"Validation report '{name}' is not valid JSON: {exc}")
                continue
            thresholds = item.get("thresholds", {}) or {}
            for metric, minimum in thresholds.items():
                value = self._nested_get(report, metric)
                if value is None:
                    issues.append(f"Validation report '{name}' missing metric '{metric}'.")
                    continue
                try:
                    numeric_value = float(value)
                    numeric_minimum = float(minimum)
                except (TypeError, ValueError):
                    issues.append(f"Validation metric '{name}.{metric}' is not numeric: {value!r}")
                    continue
                scores[f"{name}.{metric}"] = numeric_value
                if numeric_value < numeric_minimum:
                    issues.append(f"Validation metric below threshold: {name}.{metric}={numeric_value} < {numeric_minimum}")
        return issues, warnings, scores

    def _load_manifest(self) -> dict[str, Any]:
        if not self.manifest_path.exists():
            return {
                "required_approvals": {
                    "clinical_validation_signed": False,
                    "safety_validation_signed": False,
                    "benchmark_validation_signed": False,
                    "data_governance_signed": False,
                },
                "minimum_runtime_asset_counts": {"kg_rows": 1, "vs_passages": 1, "prescription_evidence_rows": 1, "amm_rows": 1, "alias_rows": 1, "safety_profile_rows": 1, "indication_map_rows": 1},
            }
        return json.loads(self.manifest_path.read_text(encoding="utf-8"))

    @staticmethod
    def _count_csv_rows(path: Path) -> int:
        if not path.exists():
            return 0
        with path.open("r", encoding="utf-8-sig") as fh:
            reader = csv.reader(fh)
            rows = list(reader)
        return max(0, len(rows) - 1)

    @staticmethod
    def _count_jsonl_rows(path: Path) -> int:
        if not path.exists():
            return 0
        count = 0
        with path.open("r", encoding="utf-8-sig") as fh:
            for line in fh:
                if line.strip():
                    count += 1
        return count

    @staticmethod
    def _csv_columns(path: Path) -> set[str]:
        with path.open("r", encoding="utf-8-sig") as fh:
            reader = csv.DictReader(fh)
            return {str(col).strip().lower() for col in (reader.fieldnames or [])}

    @staticmethod
    def _first_jsonl_record(path: Path) -> dict[str, Any]:
        with path.open("r", encoding="utf-8-sig") as fh:
            for line in fh:
                if line.strip():
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        return {}
                    return data if isinstance(data, dict) else {}
        return {}

    @staticmethod
    def _nested_get(data: dict[str, Any], dotted_key: str) -> Any:
        current: Any = data
        for part in dotted_key.split("."):
            if not isinstance(current, dict) or part not in current:
                return None
            current = current[part]
        return current
