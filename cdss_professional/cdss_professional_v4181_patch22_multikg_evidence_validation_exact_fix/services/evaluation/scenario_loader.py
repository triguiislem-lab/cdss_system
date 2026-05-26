from __future__ import annotations

import json
from pathlib import Path

from libs.contracts.commands import DraftPrescriptionCommand


class ScenarioLoader:
    """Loads scenario files for replay and benchmark runs."""

    def list_available(self, directory: str) -> list[str]:
        path = Path(directory)
        if not path.exists():
            return []
        return sorted(item.name for item in path.glob('*.json'))

    def load_requests(self, directory: str) -> list[DraftPrescriptionCommand]:
        path = Path(directory)
        if not path.exists():
            return []
        requests: list[DraftPrescriptionCommand] = []
        for item in sorted(path.glob('*.json')):
            payload = json.loads(item.read_text(encoding='utf-8'))
            requests.append(DraftPrescriptionCommand(**payload))
        return requests
