# Safety and localization integration status

Safety and localization are now runtime-augmented rather than fixture-only.

Safety guardrails combine:
- runtime signals from `tn_master_vs_corpus.jsonl`;
- route/review/emergency signals from `tn_master_kg_edges.csv`;
- known DCI and review-status signals from `tn_master_amm_catalog.csv`;
- a small defensive fallback guardrail set under `examples/demo_fixtures/safety_rules_stub.json`.

The fallback guardrails are not considered an authoritative clinical source. Clinical deployment remains blocked by governance until safety validation reports meet configured thresholds.

Localization uses the Tunisia AMM catalog as product truth and maps DCI-level draft rows to local product candidates. VEI/reimbursement notes are conservative: if the runtime AMM export lacks reimbursement data, the system does not invent it and marks rows that need review.

Open production tasks:
- import a pharmacist-validated DDI/contraindication/pregnancy/renal/hepatic source;
- validate AMM matching accuracy and unresolved-row handling;
- add official reimbursement/VEI data when available.
