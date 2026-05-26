from libs.contracts.ingestion import IngestionReport
from services.ingestion.amm_loader import AMMLoader
from services.ingestion.ddi_loader import DDILoader
from services.ingestion.embedding_indexer import EmbeddingIndexer
from services.ingestion.graph_builder import GraphBuilder
from services.ingestion.rcp_loader import RCPLoader


class IngestionPipeline:
    """Runs scheduled or manual ingestion jobs."""

    def __init__(self) -> None:
        self.amm_loader = AMMLoader()
        self.rcp_loader = RCPLoader()
        self.ddi_loader = DDILoader()
        self.graph_builder = GraphBuilder()
        self.embedding_indexer = EmbeddingIndexer()

    def run(self) -> IngestionReport:
        jobs = [
            self.amm_loader.run(),
            self.rcp_loader.run(),
            self.ddi_loader.run(),
            self.graph_builder.run(),
            self.embedding_indexer.run(),
        ]
        return IngestionReport(jobs=jobs)
