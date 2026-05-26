from pathlib import Path

from libs.knowledge_connectors.neo4j_client import Neo4jClient


def test_kuzu_client_falls_back_to_hetionet_primekg_csv_export(tmp_path: Path):
    kg_root = tmp_path / "hetionet_primekg_kuzu_full"
    db_dir = kg_root / "db.kuzu"
    db_dir.mkdir(parents=True)
    (kg_root / "nodes.csv").write_text(
        "node_id,name,label,type_family,source,db_id,norm_name,props_json\n"
        "n1,Warfarin,drug,drug,both,CHEBI:10033,warfarin,{}\n"
        "n2,CYP2C9,gene,gene,both,HGNC:2623,cyp2c9,{}\n"
        "n3,Bleeding,phenotype,disease,both,HP:0001892,bleeding,{}\n",
        encoding="utf-8",
    )
    (kg_root / "edges.csv").write_text(
        "src,dst,edge_key,rel_type,relation,source,props_json,rel_table,origin,coasserted_key\n"
        "n1,n2,e1,associated_with,drug_gene,primekg,{},ASSOCIATED_WITH,primekg,false\n"
        "n1,n3,e2,contraindication,drug_disease,primekg,{},CONTRAINDICATION,primekg,true\n",
        encoding="utf-8",
    )

    client = Neo4jClient(backend="kuzu", csv_path=db_dir)
    facts = client.fetch_related_facts("warfarin CYP2C9 bleeding", limit=10)

    assert facts
    assert any(f.subject == "Warfarin" and "CYP2C9" in f.object for f in facts)
    assert any("Bleeding" in f.object for f in facts)
    assert all("hetionet_primekg_csv" in f.provenance for f in facts)
