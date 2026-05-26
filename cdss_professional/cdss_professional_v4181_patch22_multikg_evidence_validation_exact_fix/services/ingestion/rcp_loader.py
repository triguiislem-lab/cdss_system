from libs.contracts.ingestion import IngestionJobResult
from services.ingestion.helpers import project_path, result_from_runtime_file


class RCPLoader:
    """Validate runtime VS/RCP evidence passages."""

    def run(self) -> IngestionJobResult:
        path = project_path('data', 'runtime', 'tn_prescription_evidence_corpus.jsonl')
        return result_from_runtime_file('rcp_loader', path, 'Validated runtime prescription evidence corpus.')
