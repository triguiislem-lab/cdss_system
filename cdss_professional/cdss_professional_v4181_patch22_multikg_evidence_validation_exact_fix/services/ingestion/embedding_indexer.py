from libs.contracts.ingestion import IngestionJobResult
from services.ingestion.helpers import project_path, result_from_runtime_file


class EmbeddingIndexer:
    """Validate runtime prescription evidence corpus used to build or refresh embeddings."""

    def run(self) -> IngestionJobResult:
        path = project_path('data', 'runtime', 'tn_prescription_evidence_corpus.jsonl')
        return result_from_runtime_file('embedding_indexer', path, 'Validated runtime prescription evidence corpus for vector indexing.')
