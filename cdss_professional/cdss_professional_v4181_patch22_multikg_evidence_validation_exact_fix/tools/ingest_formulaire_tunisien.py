from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path


FORMULAIRE_METADATA = {
    "source_system": "formulaire_therapeutique_tunisien_2012",
    "source_type": "official_tunisian_formulary",
    "authority": "DPM / Ministere de la Sante",
    "country": "TN",
    "year": 2012,
    "freshness_status": "historical_local_reference",
    "accepted_for_clinical_use": True,
    "requires_freshness_check_for_availability_price": True,
}


PRODUCT_RE = re.compile(
    r"^[•\-\*]\s*(?P<brand>[A-Z0-9][A-Z0-9 \-'/\.]+?)\s+"
    r"(?P<strength>\d+(?:[,.]\d+)?\s*(?:MG|G|ML|UI|MCG|µG|%)(?:[/0-9A-Z,. ]*)?)\s+"
    r"(?P<form>.+?)\s+"
    r"(?P<route>Orale|Parentérale|Locale|Ophtalmique|Auriculaire|Nasale|Rectale|Vaginale)\s+"
    r"(?P<price>H|\d+[,.]\d+\s*DT)?\s*"
    r"\[(?P<class>[VEIC])\]",
    flags=re.IGNORECASE,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract best-effort product/evidence/KG layers from Formulaire Thérapeutique Tunisien 2012.")
    parser.add_argument("--pdf", type=Path, default=Path("formulaire_tunisien_3ed.pdf"))
    parser.add_argument("--out-dir", type=Path, default=Path("data/runtime/formulaire_tunisien"))
    parser.add_argument("--max-pages", type=int, default=0, help="0 means all pages")
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    text_pages = extract_pdf_text(args.pdf, max_pages=args.max_pages or None)

    products, evidence_sections, kg_edges = parse_pages(text_pages)

    product_path = args.out_dir / "formulaire_tunisien_products.csv"
    evidence_path = args.out_dir / "formulaire_tunisien_evidence_sections.jsonl"
    kg_path = args.out_dir / "formulaire_tunisien_kg_edges.csv"
    summary_path = args.out_dir / "formulaire_tunisien_ingestion_summary.json"

    write_products(product_path, products)
    write_jsonl(evidence_path, evidence_sections)
    write_kg(kg_path, kg_edges)
    summary = {
        **FORMULAIRE_METADATA,
        "pdf": str(args.pdf),
        "product_rows": len(products),
        "evidence_sections": len(evidence_sections),
        "kg_edges": len(kg_edges),
        "outputs": {
            "products": str(product_path),
            "evidence_sections": str(evidence_path),
            "kg_edges": str(kg_path),
        },
    }
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


def extract_pdf_text(pdf_path: Path, max_pages: int | None = None) -> list[tuple[int, str]]:
    if not pdf_path.exists():
        raise FileNotFoundError(pdf_path)

    try:
        import fitz  # type: ignore
        pages = []
        with fitz.open(str(pdf_path)) as doc:
            n = min(len(doc), max_pages or len(doc))
            for i in range(n):
                pages.append((i + 1, doc[i].get_text("text")))
        return pages
    except Exception:
        pass

    try:
        from pypdf import PdfReader  # type: ignore
        reader = PdfReader(str(pdf_path))
        pages = []
        n = min(len(reader.pages), max_pages or len(reader.pages))
        for i in range(n):
            pages.append((i + 1, reader.pages[i].extract_text() or ""))
        return pages
    except Exception as exc:
        raise RuntimeError("Could not extract PDF text. Install pymupdf or pypdf.") from exc


def parse_pages(text_pages: list[tuple[int, str]]):
    products = []
    evidence_sections = []
    kg_edges = []

    current_chapter_code = ""
    current_chapter_title = ""
    current_dci = ""
    section_buffer: list[str] = []
    section_start_page = None

    for page, text in text_pages:
        lines = [clean_line(x) for x in text.splitlines()]
        lines = [x for x in lines if x]
        for line in lines:
            chapter = parse_chapter_heading(line)
            if chapter:
                flush_section(evidence_sections, kg_edges, current_dci, current_chapter_code, current_chapter_title, section_buffer, section_start_page or page)
                section_buffer = []
                section_start_page = page
                current_chapter_code, current_chapter_title = chapter
                continue

            if is_dci_heading(line):
                flush_section(evidence_sections, kg_edges, current_dci, current_chapter_code, current_chapter_title, section_buffer, section_start_page or page)
                section_buffer = []
                section_start_page = page
                current_dci = line.strip()
                continue

            product = parse_product_line(line, current_dci, current_chapter_code, current_chapter_title, page)
            if product:
                products.append(product)
                kg_edges.append({
                    "subject": product["dci"] or product["brand_name"],
                    "predicate": "has_tunisian_brand",
                    "object": product["brand_name"],
                    "source_system": FORMULAIRE_METADATA["source_system"],
                    "page": page,
                    "chapter_code": current_chapter_code,
                    "chapter_title": current_chapter_title,
                })
                if current_chapter_title:
                    kg_edges.append({
                        "subject": product["dci"] or product["brand_name"],
                        "predicate": "belongs_to_therapeutic_class",
                        "object": current_chapter_title,
                        "source_system": FORMULAIRE_METADATA["source_system"],
                        "page": page,
                        "chapter_code": current_chapter_code,
                        "chapter_title": current_chapter_title,
                    })
                continue

            if len(line) > 40 and not line.startswith("•"):
                section_buffer.append(line)
                if section_start_page is None:
                    section_start_page = page

    flush_section(evidence_sections, kg_edges, current_dci, current_chapter_code, current_chapter_title, section_buffer, section_start_page or (text_pages[-1][0] if text_pages else 1))
    return products, evidence_sections, kg_edges


def parse_product_line(line: str, current_dci: str, chapter_code: str, chapter_title: str, page: int) -> dict | None:
    match = PRODUCT_RE.search(line)
    if not match:
        return None
    price_raw = (match.group("price") or "").strip()
    hospital_only = price_raw.upper() == "H"
    return {
        **FORMULAIRE_METADATA,
        "dci": current_dci,
        "brand_name": match.group("brand").strip(),
        "strength": match.group("strength").strip(),
        "form": match.group("form").strip(),
        "presentation": match.group("form").strip(),
        "route": match.group("route").strip(),
        "company_lab": "",
        "price_2012_dt": "" if hospital_only else price_raw.replace("DT", "").strip(),
        "hospital_only": hospital_only,
        "therapeutic_value_class": match.group("class").upper(),
        "chapter_code": chapter_code,
        "chapter_title": chapter_title,
        "page": page,
    }


def flush_section(evidence_sections: list[dict], kg_edges: list[dict], dci: str, chapter_code: str, chapter_title: str, buffer: list[str], page: int) -> None:
    text = " ".join(buffer).strip()
    if len(text) < 80:
        return
    section_kind = infer_section_kind(text)
    evidence_sections.append({
        **FORMULAIRE_METADATA,
        "dci": dci,
        "chapter_code": chapter_code,
        "chapter_title": chapter_title,
        "section_kind": section_kind,
        "content": text,
        "page": page,
        "quality_tier": "historical_official_local_reference",
    })
    for predicate, keywords in [
        ("contraindicated_in", ["contre-indiqué", "contre-indication", "contre indiqué"]),
        ("caution_in", ["prudence", "attention", "s'impose"]),
        ("interacts_with", ["interaction", "association", "simultanée"]),
        ("dose_adjustment_in", ["posologie", "dose", "réduite", "adaptée", "insuffisance rénale", "insuffisance hépatique"]),
        ("indicated_for", ["indiqué", "utilisé", "traitement"]),
    ]:
        if any(k.lower() in text.lower() for k in keywords):
            kg_edges.append({
                "subject": dci or chapter_title,
                "predicate": predicate,
                "object": section_kind,
                "source_system": FORMULAIRE_METADATA["source_system"],
                "page": page,
                "chapter_code": chapter_code,
                "chapter_title": chapter_title,
            })


def parse_chapter_heading(line: str) -> tuple[str, str] | None:
    match = re.match(r"^(\d+(?:\.\d+)*)\.\s*-\s*(.+)$", line.strip())
    if not match:
        return None
    return match.group(1), match.group(2).strip()


def is_dci_heading(line: str) -> bool:
    stripped = line.strip()
    if len(stripped) < 3 or len(stripped) > 80:
        return False
    if stripped.startswith("•") or any(x in stripped for x in [".", ",", ";", ":"]):
        return False
    letters = [ch for ch in stripped if ch.isalpha()]
    if not letters:
        return False
    return sum(1 for ch in letters if ch.isupper()) / max(1, len(letters)) > 0.85


def infer_section_kind(text: str) -> str:
    lowered = text.lower()
    if "contre-ind" in lowered:
        return "contraindication"
    if "interaction" in lowered or "association" in lowered:
        return "interaction"
    if "grossesse" in lowered or "femme enceinte" in lowered:
        return "pregnancy"
    if "insuffisance rénale" in lowered or "rein" in lowered or "rénale" in lowered:
        return "renal"
    if "insuffisance hépatique" in lowered or "foie" in lowered or "hépatique" in lowered:
        return "hepatic"
    if "posologie" in lowered or "dose" in lowered:
        return "dosage"
    if "indiqué" in lowered or "traitement" in lowered:
        return "indication"
    if "prudence" in lowered or "attention" in lowered:
        return "warning"
    return "therapeutic_context"


def write_products(path: Path, rows: list[dict]) -> None:
    fieldnames = [
        "source_system", "source_type", "authority", "country", "year", "freshness_status",
        "accepted_for_clinical_use", "requires_freshness_check_for_availability_price",
        "dci", "brand_name", "strength", "form", "presentation", "route", "company_lab",
        "price_2012_dt", "hospital_only", "therapeutic_value_class", "chapter_code", "chapter_title", "page",
    ]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_jsonl(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_kg(path: Path, rows: list[dict]) -> None:
    fieldnames = ["subject", "predicate", "object", "source_system", "page", "chapter_code", "chapter_title"]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", line.replace("\u00a0", " ")).strip()


if __name__ == "__main__":
    main()
