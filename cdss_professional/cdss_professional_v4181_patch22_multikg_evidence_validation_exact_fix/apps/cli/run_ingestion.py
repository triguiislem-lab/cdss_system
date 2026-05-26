from __future__ import annotations

import json

from services.ingestion.pipeline import IngestionPipeline


def main() -> None:
    report = IngestionPipeline().run()
    print(json.dumps(report.model_dump(mode='json'), indent=2))


if __name__ == '__main__':
    main()
