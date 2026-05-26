from __future__ import annotations

import csv
import json
from pathlib import Path


INPUT_ROOT = Path("/kaggle/input/datasets/islemtrigui6/hetionet-primekg-kuzu-database")
OUTPUT_DIR = Path("/kaggle/working/kg_cdss_review_outputs/cdss_integration_files")


def main() -> None:
    kg_root = _find_kg_root(INPUT_ROOT)
    nodes_csv = kg_root / "nodes.csv"
    edges_csv = kg_root / "edges.csv"
    if not nodes_csv.exists() or not edges_csv.exists():
        raise FileNotFoundError(f"Missing nodes.csv or edges.csv under {kg_root}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    node_lookup = _load_node_lookup(nodes_csv)
    counts = _extract_edges(edges_csv, node_lookup, OUTPUT_DIR)
    _write_entity_dictionary(nodes_csv, OUTPUT_DIR / "cdss_entity_dictionary.csv")
    (OUTPUT_DIR / "cdss_extraction_counts.json").write_text(json.dumps(counts, indent=2), encoding="utf-8")

    print("CDSS KG extraction complete.")
    print(json.dumps(counts, indent=2))
    print(f"Output directory: {OUTPUT_DIR}")


def _find_kg_root(input_root: Path) -> Path:
    matches = sorted(input_root.rglob("db.kuzu"))
    if not matches:
        raise FileNotFoundError(f"Could not find db.kuzu under {input_root}")
    return matches[0].parent


def _load_node_lookup(nodes_csv: Path) -> dict[str, dict[str, str]]:
    lookup: dict[str, dict[str, str]] = {}
    with nodes_csv.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            node_id = row.get("node_id") or row.get("id")
            if not node_id:
                continue
            lookup[str(node_id)] = {
                "name": row.get("name") or str(node_id),
                "type_family": row.get("type_family") or row.get("type") or row.get("label") or "missing",
                "type": row.get("label") or row.get("type") or row.get("type_family") or "missing",
            }
    return lookup


def _extract_edges(edges_csv: Path, node_lookup: dict[str, dict[str, str]], output_dir: Path) -> dict[str, int]:
    paths = {
        "drug_disease": output_dir / "cdss_drug_disease_edges.csv",
        "drug_gene": output_dir / "cdss_drug_gene_edges.csv",
        "disease_gene": output_dir / "cdss_disease_gene_edges.csv",
    }
    counts = {name: 0 for name in paths}
    writers: dict[str, csv.DictWriter[str]] = {}
    handles = {}
    fieldnames: list[str] | None = None
    try:
        with edges_csv.open("r", encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh)
            base_fields = list(reader.fieldnames or [])
            fieldnames = base_fields + [
                "source_node_name",
                "target_node_name",
                "source_type_family",
                "target_type_family",
                "source_type",
                "target_type",
            ]
            for row in reader:
                enriched = _enrich_edge(row, node_lookup)
                relation = row.get("relation") or row.get("rel_type") or row.get("rel_table") or ""
                if not _relation_is_cdss_relevant(relation):
                    continue
                src_type = f"{enriched['source_type_family']} {enriched['source_type']}"
                dst_type = f"{enriched['target_type_family']} {enriched['target_type']}"
                kind = _edge_kind(src_type, dst_type)
                if kind is None:
                    continue
                if kind not in writers:
                    handle = paths[kind].open("w", encoding="utf-8", newline="")
                    handles[kind] = handle
                    writers[kind] = csv.DictWriter(handle, fieldnames=fieldnames)
                    writers[kind].writeheader()
                writers[kind].writerow({key: enriched.get(key, "") for key in fieldnames})
                counts[kind] += 1
    finally:
        for handle in handles.values():
            handle.close()

    return counts


def _enrich_edge(row: dict[str, str], node_lookup: dict[str, dict[str, str]]) -> dict[str, str]:
    src = row.get("src") or row.get("source") or ""
    dst = row.get("dst") or row.get("target") or ""
    src_meta = node_lookup.get(src, {})
    dst_meta = node_lookup.get(dst, {})
    enriched = dict(row)
    enriched["source_node_name"] = src_meta.get("name", src)
    enriched["target_node_name"] = dst_meta.get("name", dst)
    enriched["source_type_family"] = src_meta.get("type_family", "missing")
    enriched["target_type_family"] = dst_meta.get("type_family", "missing")
    enriched["source_type"] = src_meta.get("type", "missing")
    enriched["target_type"] = dst_meta.get("type", "missing")
    return enriched


def _edge_kind(src_type: str, dst_type: str) -> str | None:
    src_is_drug = _is_drug_type(src_type)
    dst_is_drug = _is_drug_type(dst_type)
    src_is_disease = _is_disease_type(src_type)
    dst_is_disease = _is_disease_type(dst_type)
    src_is_gene = _is_gene_type(src_type)
    dst_is_gene = _is_gene_type(dst_type)
    if (src_is_drug and dst_is_disease) or (src_is_disease and dst_is_drug):
        return "drug_disease"
    if (src_is_drug and dst_is_gene) or (src_is_gene and dst_is_drug):
        return "drug_gene"
    if (src_is_disease and dst_is_gene) or (src_is_gene and dst_is_disease):
        return "disease_gene"
    return None


def _relation_is_cdss_relevant(value: str) -> bool:
    relation = value.lower().strip()
    keywords = (
        "treat",
        "palliat",
        "contra",
        "indicat",
        "side",
        "effect",
        "associate",
        "target",
        "bind",
        "interact",
        "gene",
        "expression",
        "upreg",
        "downreg",
        "cause",
        "risk",
        "phenotype",
    )
    return any(keyword in relation for keyword in keywords)


def _is_drug_type(value: str) -> bool:
    text = value.lower()
    return any(token in text for token in ("compound", "drug", "pharmacologic", "chemical"))


def _is_disease_type(value: str) -> bool:
    text = value.lower()
    return any(token in text for token in ("disease", "condition", "phenotype", "symptom"))


def _is_gene_type(value: str) -> bool:
    text = value.lower()
    return any(token in text for token in ("gene", "protein"))


def _write_entity_dictionary(nodes_csv: Path, output_path: Path) -> None:
    with nodes_csv.open("r", encoding="utf-8-sig", newline="") as src, output_path.open("w", encoding="utf-8", newline="") as dst:
        reader = csv.DictReader(src)
        base_fields = list(reader.fieldnames or [])
        fieldnames = base_fields + ["cdss_entity_id", "cdss_entity_name", "cdss_type_family", "cdss_type"]
        writer = csv.DictWriter(dst, fieldnames=fieldnames)
        writer.writeheader()
        for row in reader:
            node_id = row.get("node_id") or row.get("id") or ""
            row["cdss_entity_id"] = node_id
            row["cdss_entity_name"] = row.get("name") or node_id
            row["cdss_type_family"] = row.get("type_family") or row.get("type") or row.get("label") or "missing"
            row["cdss_type"] = row.get("label") or row.get("type") or row.get("type_family") or "missing"
            writer.writerow(row)


if __name__ == "__main__":
    main()
