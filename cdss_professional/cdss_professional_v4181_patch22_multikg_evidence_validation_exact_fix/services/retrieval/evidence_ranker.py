from __future__ import annotations

import re

from libs.contracts.evidence import EvidenceChunk, KnowledgeGraphFact, LocalProductEvidence

SOURCE_WEIGHTS = {
    "structured_drug_knowledge": 0.22,
    "local_official_evidence": 0.24,
    "regulatory_label": 0.18,
    "guideline": 0.16,
    "safety_rule": 0.14,
    "textbook": 0.05,
    "general": 0.0,
    "support_only": -0.16,
    "exam_qa": -0.42,
}


class EvidenceRanker:
    """Notebook-inspired retrieval reranker with model support.

    This ports the large notebook's ideas into the runtime project without copying
    the whole retrieval stack: source buckets, exact term hits, and patient-risk
    boosts. Supports multiple reranking models:
    - BAAI/bge-reranker-v2-m3: Main reranking model (multilingual, excellent performance)
    - cross-encoder/ms-marco-MiniLM-L6-v2: English-only fallback
    """

    def __init__(self, reranker_model: str | None = None, fallback_model: str | None = None):
        self.reranker_model = reranker_model or "BAAI/bge-reranker-v2-m3"
        self.fallback_model = fallback_model or "cross-encoder/ms-marco-MiniLM-L6-v2"
        self._reranker = None
        self._fallback_reranker = None

    def rank_chunks(self, items: list[EvidenceChunk], query_terms: list[str] | None = None) -> list[EvidenceChunk]:
        return self._rank(items, query_terms, lambda item: {
            "source": item.source,
            "book": item.metadata.get("book", ""),
            "section": item.metadata.get("section", ""),
            "subject": item.title,
            "text": item.content,
            "quality_flags": item.metadata.get("quality_flags", ""),
            "authority_level": item.metadata.get("authority_level", ""),
            "authority_class": item.metadata.get("authority_class", ""),
        })

    def rank_facts(self, items: list[KnowledgeGraphFact], query_terms: list[str] | None = None) -> list[KnowledgeGraphFact]:
        return self._rank(items, query_terms, lambda item: {
            "source": item.provenance or "kg",
            "book": "",
            "section": item.predicate,
            "subject": item.subject,
            "text": f"{item.subject} {item.predicate} {item.object}",
        })

    def rank_products(self, items: list[LocalProductEvidence], query_terms: list[str] | None = None) -> list[LocalProductEvidence]:
        return self._rank(items, query_terms, lambda item: {
            "source": item.metadata.get("source", "local_formulary"),
            "book": item.metadata.get("source", ""),
            "section": item.dosage_form,
            "subject": item.product_name,
            "text": f"{item.product_name} {item.active_ingredient} {item.strength} {item.dosage_form} {item.metadata.get('indication', '')}",
            "quality_flags": item.metadata.get("quality_flags", ""),
            "authority_level": item.metadata.get("authority_level", ""),
            "authority_class": item.metadata.get("authority_class", ""),
        })

    def _rank(self, items: list, query_terms: list[str] | None, record_builder) -> list:
        terms = [term.lower() for term in (query_terms or []) if term.strip()]
        model_ranked = self._rank_with_cross_encoder(items, terms, record_builder)
        if model_ranked is not None:
            return model_ranked
        return self._rank_heuristic(items, terms, record_builder)

    def _rank_with_cross_encoder(self, items: list, terms: list[str], record_builder) -> list | None:
        if not items or not terms:
            return None
        try:
            if self._reranker is None:
                from sentence_transformers import CrossEncoder  # type: ignore
                self._reranker = CrossEncoder(self.reranker_model)
            query = " ".join(terms[:16])
            records = [record_builder(item) for item in items]
            pairs = [
                [query, " ".join([str(record.get("subject", "")), str(record.get("section", "")), str(record.get("text", ""))])[:4096]]
                for record in records
            ]
            predictions = self._reranker.predict(pairs)
        except Exception:
            try:
                if self._fallback_reranker is None:
                    from sentence_transformers import CrossEncoder  # type: ignore
                    self._fallback_reranker = CrossEncoder(self.fallback_model)
                query = " ".join(terms[:16])
                records = [record_builder(item) for item in items]
                pairs = [
                    [query, " ".join([str(record.get("subject", "")), str(record.get("section", "")), str(record.get("text", ""))])[:4096]]
                    for record in records
                ]
                predictions = self._fallback_reranker.predict(pairs)
            except Exception:
                return None

        ranked = []
        model_name = self.reranker_model if self._reranker is not None else self.fallback_model
        for item, raw_score in zip(items, predictions):
            model_score = self._normalize_model_score(float(raw_score))
            record = record_builder(item)
            quality_adjustment = self._quality_adjustment(record, terms)
            adjusted = (0.35 * float(getattr(item, "score", 0.0) or 0.0)) + (0.65 * model_score) + quality_adjustment
            update = {"score": round(adjusted, 3)}
            if hasattr(item, "metadata"):
                metadata = dict(getattr(item, "metadata", {}) or {})
                metadata.update(
                    {
                        "reranker_model": model_name,
                        "reranker_model_used": True,
                        "reranker_raw_score": round(float(raw_score), 4),
                        "reranker_normalized_score": round(model_score, 3),
                        "quality_adjustment": round(quality_adjustment, 3),
                    }
                )
                update["metadata"] = metadata
            ranked.append(item.model_copy(update=update))
        return sorted(ranked, key=lambda x: x.score, reverse=True)

    @staticmethod
    def _normalize_model_score(score: float) -> float:
        # Cross-encoder logits are not guaranteed to be bounded.
        if score >= 20:
            return 1.0
        if score <= -20:
            return 0.0
        return 1.0 / (1.0 + pow(2.718281828, -score))

    def _rank_heuristic(self, items: list, terms: list[str], record_builder) -> list:
        patient_status = self._patient_status_terms(terms)
        ranked = []
        for item in items:
            record = record_builder(item)
            exact_hits = self._exact_term_hits(record, terms)
            bucket = self._source_bucket(record)
            patient_boost = self._patient_context_boost(record, patient_status)
            quality_adjustment = self._quality_adjustment(record, terms)
            adjusted = float(getattr(item, "score", 0.0))
            adjusted += SOURCE_WEIGHTS.get(bucket, 0.0)
            adjusted += min(0.07, exact_hits * 0.015)
            adjusted += patient_boost
            adjusted += quality_adjustment
            update = {"score": round(adjusted, 3)}
            if hasattr(item, 'metadata'):
                metadata = dict(getattr(item, 'metadata', {}) or {})
                metadata.update({
                    "source_bucket": bucket,
                    "exact_term_hits": exact_hits,
                    "patient_boost": round(patient_boost, 3),
                    "quality_adjustment": round(quality_adjustment, 3),
                    "reranker_model": self.reranker_model,
                    "reranker_model_used": False,
                    "reranker_model_status": "unavailable_or_not_loaded",
                })
                update["metadata"] = metadata
            ranked.append(item.model_copy(update=update))
        return sorted(ranked, key=lambda x: x.score, reverse=True)

    @staticmethod
    def _source_bucket(record: dict) -> str:
        meta = " ".join([
            str(record.get("source", "") or ""),
            str(record.get("book", "") or ""),
            str(record.get("section", "") or ""),
            str(record.get("subject", "") or ""),
            str(record.get("quality_flags", "") or ""),
            str(record.get("authority_level", "") or ""),
            str(record.get("authority_class", "") or ""),
        ]).lower()
        if any(k in meta for k in ["support_only", "brand_query_support_source_needs_review"]):
            return "support_only"
        if "local_official_or_local_document" in meta or "local_dpm_rcp" in meta or "local_lab_document" in meta:
            return "local_official_evidence"
        if any(k in meta for k in ["regulatory_label_or_reference", "dailymed", "openfda", "bdpm", "smpc", "aemps", "swissmedic", "who", "cecmed"]):
            return "regulatory_label"
        if any(k in meta for k in ["tunisia", "amm", "bdpm", "drugcentral", "ddinter", "onsides", "formulaire", "formulary", "reimbursement", "vei", "rxnorm"]):
            return "structured_drug_knowledge"
        if any(k in meta for k in ["guideline", "guidelines", "hta", "ineas", "consensus", "protocol", "pathway", "thesaurus", "recommendation", "msf"]):
            return "guideline"
        if any(k in meta for k in ["interaction", "contraindication", "renal", "hepatic", "pregnancy", "dose", "dosage", "tox", "warning"]):
            return "safety_rule"
        if any(k in meta for k in ["pubmedqa", "medqa", "medmcqa", "usmle", "qa", "exam"]):
            return "exam_qa"
        if any(k in meta for k in ["textbook", "manual", "harrison", "merck"]):
            return "textbook"
        return "general"

    @staticmethod
    def _quality_adjustment(record: dict, terms: list[str]) -> float:
        text = " ".join([
            str(record.get("source", "") or ""),
            str(record.get("book", "") or ""),
            str(record.get("section", "") or ""),
            str(record.get("subject", "") or ""),
            str(record.get("text", "") or "")[:1600],
            str(record.get("quality_flags", "") or ""),
            str(record.get("authority_level", "") or ""),
            str(record.get("authority_class", "") or ""),
        ]).lower()
        query = " ".join(terms).lower()
        adjustment = 0.0
        if any(k in text for k in ["rcp", "smpc", "posologie", "dosage", "dose", "maximum daily", "contre-indications", "contraindication"]):
            adjustment += 0.08
        if any(k in text for k in ["local_dpm_rcp", "tunisia_dpm", "amm", "local official"]):
            adjustment += 0.08
        if any(k in text for k in ["guideline", "recommendation", "consensus", "protocol"]):
            adjustment += 0.06
        is_exam_or_qa = any(k in text for k in ["pubmedqa", "medqa", "medmcqa", "usmle", "exam"])
        if is_exam_or_qa:
            adjustment -= 0.30
        if any(k in text for k in ["parents", "toddlers", "children", "pediatric", "paediatric"]) and not any(
            k in query for k in ["child", "children", "pediatric", "paediatric", "infant"]
        ):
            adjustment -= 0.09
        if any(k in text for k in ["overdose", "self-harm", "poisoning", "suicide"]) and not any(
            k in query for k in ["overdose", "poisoning", "toxicity", "self harm", "suicide"]
        ):
            adjustment -= 0.18
        if any(k in text for k in ["acute liver failure", "fulminant hepatic", "toxicity", "adverse drug reaction"]) and not any(
            k in query for k in ["hepatic", "liver", "toxicity", "overdose", "poisoning", "adverse", "safety"]
        ):
            adjustment -= 0.12
        if any(k in text for k in ["adult dose", "adult dosing", "posologie adulte", "500 mg", "every 6 hours", "every 8 hours", "3 days"]):
            adjustment += 0.05
        return max(-0.48, min(0.28, adjustment))

    @staticmethod
    def _exact_term_hits(record: dict, terms: list[str]) -> int:
        hay = " ".join([
            str(record.get("text", "") or ""),
            str(record.get("book", "") or ""),
            str(record.get("section", "") or ""),
            str(record.get("subject", "") or ""),
        ]).lower()
        hits = 0
        for term in terms:
            term = str(term or "").strip().lower()
            if len(term) < 3:
                continue
            if re.search(rf"(?<!\w){re.escape(term)}(?!\w)", hay):
                hits += 1
        return hits

    @staticmethod
    def _patient_status_terms(terms: list[str]) -> dict[str, bool]:
        blob = " ".join(terms)
        return {
            "pregnancy": "pregnancy" in blob,
            "renal": "renal" in blob,
            "elderly": "elderly" in blob,
            "pediatric": "pediatric" in blob,
        }

    @staticmethod
    def _patient_context_boost(record: dict, patient_status: dict[str, bool]) -> float:
        meta = " ".join([
            str(record.get("text", "") or "")[:1200],
            str(record.get("book", "") or ""),
            str(record.get("section", "") or ""),
            str(record.get("subject", "") or ""),
        ]).lower()
        boost = 0.0
        if patient_status.get("pregnancy") and any(k in meta for k in ["pregnan", "terat", "lactation"]):
            boost += 0.04
        if patient_status.get("renal") and any(k in meta for k in ["renal", "kidney", "gfr", "dfg"]):
            boost += 0.04
        if patient_status.get("elderly") and any(k in meta for k in ["elderly", "aged", "geriatric"]):
            boost += 0.02
        if patient_status.get("pediatric") and any(k in meta for k in ["pediatric", "child", "children"]):
            boost += 0.02
        return min(boost, 0.08)
