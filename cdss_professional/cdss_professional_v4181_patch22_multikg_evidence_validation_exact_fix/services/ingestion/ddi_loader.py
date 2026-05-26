from libs.contracts.ingestion import IngestionJobResult
from services.ingestion.helpers import project_path, result_from_runtime_file


class DDILoader:
    """Validate runtime safety evidence availability.

    Dedicated DDI import remains a governance task; this job confirms that the
    runtime evidence corpus used to derive conservative safety signals is present.
    """

    def run(self) -> IngestionJobResult:
        path = project_path('data', 'runtime', 'tn_prescription_evidence_corpus.jsonl')
        return result_from_runtime_file('ddi_loader', path, 'Validated runtime safety evidence corpus for conservative DDI/safety signals.')
