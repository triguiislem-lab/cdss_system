from libs.contracts.ingestion import IngestionJobResult
from services.ingestion.helpers import project_path, result_from_runtime_file


class AMMLoader:
    """Validate and register the runtime Tunisia AMM catalog."""

    def run(self) -> IngestionJobResult:
        path = project_path('data', 'runtime', 'tn_master_amm_catalog.csv')
        return result_from_runtime_file(
            'amm_loader',
            path,
            'Validated runtime Tunisia AMM catalog for localization.',
            required_columns=['dci', 'brand_name', 'strength', 'form', 'market_status'],
        )
