from __future__ import annotations

import json

from libs.config import get_settings
from services.evaluation.benchmark_runner import BenchmarkRunner


def main() -> None:
    settings = get_settings()
    report = BenchmarkRunner().run_directory(settings.benchmark_scenarios_dir)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
