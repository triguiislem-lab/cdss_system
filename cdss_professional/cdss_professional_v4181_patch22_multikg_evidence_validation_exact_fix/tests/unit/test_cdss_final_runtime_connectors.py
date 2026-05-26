import json
import sqlite3

import pandas as pd
import pytest

from libs.knowledge_connectors.local_formulary_client import LocalFormularyClient
from libs.knowledge_connectors.vector_index_client import VectorIndexClient
from services.retrieval.local_formulary_retriever import LocalFormularyRetriever


def test_tn_localization_sqlite_backend_reads_structured_medicines(tmp_path):
    db_path = tmp_path / "tn_localization.sqlite"
    con = sqlite3.connect(db_path)
    con.execute(
        """
        CREATE TABLE medicines(
            medicine_id TEXT,
            source_row_id INTEGER,
            local_product_name TEXT,
            active_ingredient_raw TEXT,
            active_ingredient_canonical TEXT,
            active_ingredient_list TEXT,
            strength_raw TEXT,
            strength_normalized TEXT,
            form_raw TEXT,
            form_normalized TEXT,
            route_inferred TEXT,
            presentation TEXT,
            lab TEXT,
            country TEXT,
            amm TEXT,
            source_system TEXT,
            evidence_status TEXT,
            price TEXT,
            classification TEXT,
            is_combination INTEGER,
            ingredient_count INTEGER,
            accepted_evidence_count INTEGER,
            evidence_section_count INTEGER,
            localization_eligible INTEGER,
            strict_mono_localization_eligible INTEGER
        )
        """
    )
    con.execute(
        """
        INSERT INTO medicines VALUES (
            'tn_med_1', 1, 'ADOL', 'PARACETAMOL', 'paracetamol', '["paracetamol"]',
            '500 mg', '500 mg', 'Comprimé', 'comprime', 'oral', 'B/15', 'SAIPH', 'Tunisie',
            '123', 'tunisia_dpm_local_rcp_pdf', 'covered_with_accepted_sections', '0.840 DT',
            '', 0, 1, 2, 2, 1, 1
        )
        """
    )
    con.commit()
    con.close()

    client = LocalFormularyClient(backend="sqlite_tn_localization", catalog_path=db_path)
    products = client.load_products()
    assert products
    assert products[0].product_name == "ADOL"
    assert products[0].active_ingredient == "paracetamol"
    assert products[0].metadata["route"] == "oral"

    retriever = LocalFormularyRetriever(client=client)
    ranked = retriever.retrieve("paracetamol 500 mg oral Tunisia mono ingredient", limit=3)
    assert ranked
    assert ranked[0].product_name == "ADOL"


def test_faiss_parquet_metadata_normalizes_evidence_records(tmp_path):
    pytest.importorskip("pyarrow")
    metadata_path = tmp_path / "tn_prescription_evidence_metadata.parquet"
    stats_path = tmp_path / "tn_prescription_evidence_vector_store_stats.json"
    pd.DataFrame(
        [
            {
                "vector_id": 0,
                "evidence_id": "ev_1",
                "local_product_name": "AEROL",
                "active_ingredient_canonical": "salbutamol",
                "section_kind": "dosage",
                "retrieval_text": "Ingredient: salbutamol Product: AEROL Section: dosage Text: inhalation dosage.",
                "source_system": "tunisia_dpm_local_rcp_pdf",
                "accepted_for_clinical_use": True,
                "quality_tier": "tier_1_structured_prescription_evidence",
            }
        ]
    ).to_parquet(metadata_path)
    stats_path.write_text(json.dumps({"query_instruction": "Instruct: test\nQuery: ", "metric": "inner_product_cosine"}), encoding="utf-8")

    client = VectorIndexClient(
        backend="faiss",
        faiss_metadata_path=metadata_path,
        faiss_stats_path=stats_path,
        embedding_model_name="dummy",
    )
    records = client._load_faiss_metadata()
    assert records[0]["active_ingredient_canonical"] == "salbutamol"

    chunk = client._normalize_record(records[0])
    assert chunk is not None
    assert chunk.source == "tunisia_dpm_local_rcp_pdf"
    assert "AEROL" in chunk.content
    assert chunk.metadata["active_ingredient"] == "salbutamol"
    assert chunk.metadata["product_name"] == "AEROL"
    assert chunk.metadata["section"] == "dosage"
