from libs.contracts.ingestion import IngestionJobResult
from services.ingestion.helpers import project_path, result_from_runtime_file


class GraphBuilder:
    """Validate and register the runtime KG CSV fallback export."""

    def run(self) -> IngestionJobResult:
        path = project_path('data', 'runtime', 'tn_master_kg_edges.csv')
        return result_from_runtime_file(
            'graph_builder',
            path,
            'Validated runtime KG edge export for structured retrieval.',
            required_columns=['disease', 'route', 'line', 'source'],
        )
