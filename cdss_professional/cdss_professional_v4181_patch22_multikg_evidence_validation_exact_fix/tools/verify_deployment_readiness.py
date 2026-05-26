from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from libs.governance import DeploymentGovernanceService


if __name__ == "__main__":
    service = DeploymentGovernanceService(project_root=ROOT)
    report = service.validate()
    print(json.dumps({
        "ok": report.ok,
        "issues": report.issues,
        "warnings": report.warnings,
        "asset_counts": report.asset_counts,
        "approvals": report.approvals,
        "validation_scores": report.validation_scores,
    }, indent=2))
    raise SystemExit(0 if report.ok else 1)
