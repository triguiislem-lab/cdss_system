# Comprendre le flux complet du projet CDSS de prescription

Date: 2026-04-30

Ce document explique la logique du projet étape par étape. L'objectif est que tu puisses lire une réponse du système, comprendre d'où elle vient, et identifier exactement quelle étape inspecter si un résultat est mauvais.

Le projet est un système d'aide à la prescription clinique pour la Tunisie. Il ne remplace pas le médecin. Par défaut, il produit une proposition à valider par un clinicien.

## Vue D'ensemble

Le point d'entrée principal est:

- API: `POST /v1/prescriptions/draft`
- Route FastAPI: `apps/api/routers/prescriptions.py`
- Pipeline principal: `services/orchestration/pipeline.py`

Le pipeline suit cet ordre:

1. Compréhension clinique
2. Récupération de preuves
3. Génération de proposition
4. Vérification de sécurité
5. Localisation Tunisie
6. Audit et traçabilité

Chaque étape est exécutée par `StageRunner`, qui enregistre:

- le nom de l'étape
- le statut: `ok`, `skipped`, ou `error`
- la durée
- le détail de l'erreur si l'étape échoue

Dans une réponse API, regarde toujours `stage_traces` en premier pour savoir où le problème est apparu.

## Entrée Du Système

L'entrée API est une consultation clinique:

- profil patient: âge, sexe, grossesse, allaitement, allergies, traitements actuels, maladies chroniques, insuffisance rénale/hépatique
- notes du médecin
- transcript de consultation
- langue de consultation

Cette entrée est convertie en `DraftPrescriptionCommand`, puis envoyée à `PrescriptionPipeline.draft()`.

## Étape 1: Compréhension Clinique

Code principal:

- `services/clinical_understanding/service.py`
- `services/clinical_understanding/translator.py`
- `services/clinical_understanding/parser.py`
- `services/clinical_understanding/risk_extractor.py`
- `services/clinical_understanding/router.py`

Sortie principale:

- `PatientSnapshot`

### 1.1 Normalisation Et Traduction

La classe `TranslationStep` prépare le texte clinique.

Elle fait trois choses:

1. nettoie les espaces dans les notes et le transcript
2. garde le texte original
3. crée une version runtime en anglais pour faciliter la recherche

Si un modèle NLLB est configuré, il est utilisé pour traduire les textes non anglais. Dans Kaggle, le modèle attendu est:

```text
/kaggle/input/datasets/islemtrigui/cdss-nllb-200-distilled-1-3b
```

Si le modèle ne charge pas, le système ne s'arrête pas. Il garde le texte original et applique une table locale de synonymes, par exemple:

- `fièvre` vers `fever`
- `toux` vers `cough`
- `grossesse` vers `pregnancy`
- `insuffisance renale` vers `renal impairment`

Champ utile pour debug:

- `snapshot.extracted_context.translation_model_status`

Valeurs possibles:

- `translation_model_used:...`
- `translation_model_fallback:...`
- `not_needed_same_language`
- `not_configured`

Si la langue est mal comprise, inspecte cette étape.

### 1.2 Extraction Clinique

La classe `ConsultationParser` extrait les informations médicales.

Elle détecte:

- symptômes: fièvre, toux, douleur thoracique, dyspnée, douleur dentaire, rash, etc.
- maladies suspectées: grippe, asthme, migraine, HTA, diabète, abcès dentaire, maladie rénale, etc.
- médicaments déjà pris
- allergies
- grossesse
- allaitement
- contexte rénal
- contexte hépatique
- durée des symptômes
- âge et sexe mentionnés dans le texte
- red flags d'urgence

Elle gère aussi:

- négation: `pas de fièvre`, `sans allergie`
- incertitude: `possible`, `suspected`, `à vérifier`
- qualité d'extraction

Sorties importantes:

- `snapshot.normalized_symptoms`
- `snapshot.suspected_conditions`
- `snapshot.disease_tags`
- `snapshot.missing_critical_information`
- `snapshot.extracted_context.parser_quality`
- `snapshot.extracted_context.red_flags`
- `snapshot.normalized_runtime_text`

Si le système ne reconnaît pas le problème clinique, inspecte:

```text
snapshot.normalized_runtime_text
snapshot.normalized_symptoms
snapshot.suspected_conditions
snapshot.extracted_context.symptom_mentions
snapshot.extracted_context.disease_mentions
```

### 1.3 Extraction Des Risques Patient

La classe `RiskExtractor` combine:

- les champs structurés du patient
- les informations extraites du texte

Elle produit `RiskFlags`:

- `pregnancy_risk`
- `renal_risk`
- `hepatic_risk`
- `allergy_risk`
- `escalation_needed`
- `notes`

Si le système bloque trop souvent à cause d'une grossesse, d'une allergie ou d'un problème rénal, inspecte:

```text
snapshot.risk_flags
snapshot.extracted_context
patient.known_allergies
patient.renal_impairment
patient.hepatic_impairment
patient.pregnant
```

### 1.4 Routage Clinique

La classe `ProductionRouter` décide le type de prise en charge:

- `prescription`: le système peut proposer une prescription à revoir
- `review`: revue clinicien obligatoire avant prescription
- `emergency`: urgence ou red flag
- `non_pharma`: cas non pharmacologique, par exemple optique/myopie

Logique principale:

- si cas optique/non pharmacologique et pas de red flag: `non_pharma`
- si red flag ou escalade nécessaire: `emergency`
- si extraction de faible confiance: `review`
- si grossesse, insuffisance rénale/hépatique, maladie sensible, information critique manquante: `review`
- sinon: `prescription`

Champ à inspecter:

```text
snapshot.route_recommendation
```

Si aucune prescription n'est générée, commence ici. Souvent le système a choisi `review`, `emergency`, ou `non_pharma`.

## Étape 2: Récupération De Preuves

Code principal:

- `services/retrieval/service.py`
- `services/retrieval/hybrid_retriever.py`
- `services/retrieval/query_builder.py`
- `services/retrieval/vector_retriever.py`
- `services/retrieval/kg_retriever.py`
- `services/retrieval/local_formulary_retriever.py`
- `services/retrieval/evidence_ranker.py`
- `services/retrieval/evidence_fuser.py`
- `services/retrieval/deduplication_service.py`

Sortie principale:

- `EvidenceBundle`

Le système récupère trois types de preuves:

1. preuves textuelles/vectorielles
2. faits du knowledge graph
3. médicaments disponibles/localisés en Tunisie

### 2.1 Construction Des Requêtes

`RetrievalQueryBuilder` transforme le `PatientSnapshot` en `RetrievalPlan`.

Il construit:

- `primary_terms`: symptômes et conditions principales
- `patient_context_tokens`: allergies, traitements actuels, grossesse, rein, foie, pédiatrie, âge avancé
- requête vectorielle
- requête KG
- requête formulaire local

Il applique aussi des alias de maladies pour les données runtime:

- `influenza`, `viral syndrome`, `upper respiratory tract infection` vers `grippe`
- `dental abscess` vers `abces_dentaire`
- `hypertension` vers `hta`
- `diabetes` vers `diabete`
- `asthma` vers `asthme`
- `migraine` vers `migraine`

Champs à inspecter:

```text
evidence.retrieval_plan.primary_terms
evidence.retrieval_plan.patient_context_tokens
evidence.retrieval_plan.queries
```

Si les preuves récupérées ne correspondent pas au cas, vérifie d'abord le `RetrievalPlan`.

### 2.2 Recherche Vectorielle

Code:

- `libs/knowledge_connectors/vector_index_client.py`
- `services/retrieval/vector_retriever.py`

Modes possibles:

- `semantic_jsonl`: corpus local JSONL avec embeddings SentenceTransformer si disponible
- `faiss`: index FAISS Kaggle
- `json` / `jsonl` / `csv`: formats simples
- fallback lexical si le modèle n'est pas disponible

Sources configurées:

Local par défaut:

```text
final_data_release/final_evidence_sections_runtime.jsonl
```

Kaggle:

```text
/kaggle/input/datasets/islemtrigui6/medical-vector-store-cdss/medical_knowledge.faiss
/kaggle/input/datasets/islemtrigui6/medical-vector-store-cdss/all_metadata.pkl
/kaggle/input/datasets/islemtrigui6/medical-vector-store-cdss/all_texts.pkl
```

Modèle embedding Kaggle:

```text
/kaggle/input/datasets/islemtrigui/cdss-bge-m3
```

Sortie:

```text
evidence.vector_chunks
```

Chaque chunk contient:

- `source`
- `title`
- `content`
- `score`
- `metadata`

Si la récupération textuelle échoue, inspecte:

```text
VECTOR_BACKEND
VECTOR_FAISS_INDEX_PATH
VECTOR_FAISS_METADATA_PATH
VECTOR_PICKLE_TEXTS_PATH
VECTOR_EMBEDDING_MODEL
evidence.vector_chunks
```

### 2.3 Recherche Knowledge Graph

Code:

- `libs/knowledge_connectors/neo4j_client.py`
- `services/retrieval/kg_retriever.py`

Backends possibles:

- `csv`: ancien KG runtime simple
- `cdss_csv_dir`: nouveau KG Hetionet + PrimeKG extrait depuis `notebook54ea2edb8d.ipynb`
- `neo4j`: Neo4j live si configuré
- `json` / `jsonl` / `stub`: fallback ou tests

Kaggle utilise:

```text
KG_BACKEND=cdss_csv_dir
KG_CATALOG_PATH=/kaggle/working/kg_cdss_review_outputs/cdss_integration_files
```

Fichiers attendus:

```text
cdss_drug_disease_edges.csv
cdss_drug_gene_edges.csv
cdss_disease_gene_edges.csv
```

Ces fichiers viennent du KG Hetionet + PrimeKG:

- 137,234 noeuds fusionnés
- 10,350,695 arêtes fusionnées
- extraction CDSS: environ 629k relations utiles

Sortie:

```text
evidence.graph_facts
```

Chaque fait KG devient:

- `subject`
- `predicate`
- `object`
- `score`
- `provenance`

Si les faits KG sont vides, inspecte:

```text
KG_BACKEND
KG_CATALOG_PATH
/kaggle/working/kg_cdss_review_outputs/cdss_integration_files
evidence.graph_facts
```

Commande Kaggle pour préparer ces fichiers:

```bash
python tools/prepare_kaggle_cdss_kg.py
```

### 2.4 Recherche Formulaire Local Tunisien

Code:

- `libs/knowledge_connectors/local_formulary_client.py`
- `services/retrieval/local_formulary_retriever.py`

Source:

```text
final_data_release/final_medicines.csv
```

Le système cherche des produits par:

- DCI / principe actif
- nom du médicament
- indication
- dosage
- forme galénique
- statut VEIC si présent

Sortie:

```text
evidence.local_products
```

Si aucun médicament local n'apparaît, inspecte:

```text
LOCAL_FORMULARY_BACKEND
LOCAL_FORMULARY_CATALOG_PATH
evidence.local_products
```

### 2.5 Reranking Des Preuves

Code:

- `services/retrieval/evidence_ranker.py`

Modèle principal:

```text
BAAI/bge-reranker-v2-m3
```

Kaggle:

```text
/kaggle/input/datasets/islemtrigui/cdss-bge-reranker-v2-m3
```

Si le modèle charge correctement, le reranking utilise `sentence_transformers.CrossEncoder`.

Si le modèle ne charge pas, il y a un fallback heuristique basé sur:

- source de la preuve
- termes exacts trouvés
- contexte patient: grossesse, rein, pédiatrie, âge avancé
- type de source: guideline, regulatory label, local official evidence, support-only, etc.

Champs utiles:

```text
chunk.metadata.reranker_model_used
chunk.metadata.reranker_model_status
chunk.metadata.reranker_raw_score
chunk.metadata.source_bucket
```

Si les preuves sont là mais mal ordonnées, inspecte le reranker.

### 2.6 Déduplication Sémantique

Code:

- `services/retrieval/deduplication_service.py`

Modèle:

```text
sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
```

Dans Kaggle, la config utilise BGE-M3 comme modèle de déduplication:

```text
DEDUPLICATION_MODEL=/kaggle/input/datasets/islemtrigui/cdss-bge-m3
```

Seuil:

```text
similarity_threshold=0.85
```

La déduplication s'applique à:

- chunks vectoriels
- faits KG
- produits locaux

Si le modèle n'est pas disponible, la déduplication est sautée et une note est ajoutée dans:

```text
evidence.merged_summary
```

## Étape 3: Génération De Prescription

Code principal:

- `services/generation/service.py`
- `services/generation/prescription_generator.py`
- `services/generation/prompt_builder.py`
- `services/generation/context_builder.py`
- `services/generation/llm_router.py`
- `services/generation/output_parser.py`
- `services/generation/candidate_selector.py`
- `services/generation/therapy_strategy.py`

Sortie principale:

- `TherapeuticPlan`

### 3.1 Construction Du Prompt

`PromptBuilder` crée un prompt structuré avec:

- contexte patient
- symptômes
- conditions suspectées
- allergies
- médicaments actuels
- risques
- preuves vectorielles
- faits KG
- produits locaux

Il utilise:

```text
services/generation/templates/prescription_generation_prompt.txt
```

Si le LLM répond mal, inspecte d'abord le prompt construit à partir de:

```text
snapshot
evidence
```

### 3.2 Choix Du Backend LLM

Code:

```text
services/generation/llm_router.py
```

Backends possibles:

- `transformers`: modèle Hugging Face local
- `openai_compatible`: endpoint compatible OpenAI
- `llama_cpp`: modèle GGUF local
- `notebook_heuristic`: fallback offline déterministe
- `stub`: ancien mode test

Kaggle est configuré pour:

```text
GENERATION_BACKEND=transformers
GENERATION_MODEL=/kaggle/working/cdss-qwen3-32b
LLM_MODEL=/kaggle/working/cdss-qwen3-32b
```

Le modèle Qwen est préparé par:

```bash
python tools/prepare_kaggle_qwen_model.py
```

Paramètres importants:

```text
GENERATION_TEMPERATURE=0.2
GENERATION_MAX_OUTPUT_TOKENS=400
GENERATION_TRANSFORMERS_DEVICE_MAP=auto
GENERATION_TRANSFORMERS_DTYPE=auto
GENERATION_TRUST_REMOTE_CODE=true
```

Si le modèle Qwen produit une réponse, le texte contient une note:

```text
llm_model_used=true backend=transformers model=/kaggle/working/cdss-qwen3-32b
```

Si le modèle ne charge pas, le système peut retomber sur la logique heuristique. Cette logique sert de garde-fou offline, mais elle ne remplace pas l'utilisation du modèle.

### 3.3 Stratégie Thérapeutique

Code:

```text
services/generation/therapy_strategy.py
```

Le système classe le cas en:

- `non_pharma`
- `emergency`
- `symptomatic`
- `review`
- `disease_directed`

Cette stratégie influence:

- si un médicament est proposé
- si les données tunisiennes servent seulement à localiser un médicament
- si le cas doit rester en revue clinicien

Exemple:

- grippe, fièvre, toux: souvent `symptomatic`
- myopie: `non_pharma`
- douleur thoracique avec red flags: `emergency`
- grossesse/rein/foie: souvent `review`

### 3.4 Sélection Des Candidats Médicamenteux

Code:

```text
services/generation/candidate_selector.py
```

Le sélecteur utilise:

- produits locaux récupérés
- faits KG
- mentions dans les textes vectoriels
- symptômes du patient
- pénalités de sécurité

Il favorise par exemple:

- `paracetamol` pour fièvre/douleur/syndrome viral
- `ibuprofen` seulement si pas de risque NSAID
- `salbutamol` pour contexte bronchospasme/asthme

Pénalités importantes:

- grossesse: pénalité forte sur NSAIDs
- insuffisance rénale: pénalité forte sur NSAIDs
- warfarine/acenocoumarol: pénalité forte sur NSAIDs
- allergie NSAID: pénalité forte sur NSAIDs
- insuffisance hépatique: prudence sur paracétamol

Si un médicament attendu n'apparaît pas, inspecte:

```text
evidence.local_products
evidence.graph_facts
evidence.vector_chunks
snapshot.risk_flags
snapshot.patient.current_medications
snapshot.patient.known_allergies
```

### 3.5 Parsing De La Réponse

Code:

```text
services/generation/output_parser.py
```

Le parser accepte deux formats:

1. format compact:

```text
problem_summary:
triage:
confidence:
medication:
support:
non_drug:
monitoring:
question:
note:
```

2. markdown structuré avec sections:

```text
## DIAGNOSIS
## PROPOSED PRESCRIPTION
## SAFETY REVIEW
## CLINICAL EVIDENCE
## MONITORING REQUIRED
## DISCLAIMER
```

Après parsing, il normalise:

- DCI en minuscules
- dose
- fréquence
- durée
- triage

Si dose/fréquence/durée est inconnue, il ajoute une question non résolue:

```text
Complete dosing details for ...
```

Cela force souvent le cas en revue clinicien.

## Étape 4: Contrat De Sécurité Avant Validation

Code:

```text
services/orchestration/pipeline.py
```

Après génération, `_enforce_contract_states()` applique des règles conservatrices:

- si route `emergency`: supprime tous les médicaments
- si route `non_pharma`: supprime tous les médicaments
- si route `review`: garde le cas en revue clinicien
- si dose incomplète: garde le cas en revue clinicien

Donc si le LLM génère un médicament mais la réponse finale n'en contient aucun, inspecte:

```text
snapshot.route_recommendation
draft_plan.generation_notes
draft_plan.unresolved_questions
```

## Étape 5: Validation De Sécurité

Code principal:

- `services/safety/service.py`
- `services/safety/allergy_rules.py`
- `services/safety/ddi_engine.py`
- `services/safety/contraindication_rules.py`
- `services/safety/pregnancy_rules.py`
- `services/safety/renal_rules.py`
- `services/safety/hepatic_rules.py`
- `services/safety/dose_guardrails.py`
- `services/safety/escalation_rules.py`

Sortie:

- `SafetyReport`

Le système vérifie:

- allergie médicament
- interactions médicament-médicament
- contre-indications
- grossesse
- insuffisance rénale
- insuffisance hépatique
- limites de dose
- besoin d'escalade

Les findings sont triés avec les critiques d'abord.

Champs importants:

```text
safety.findings
safety.has_blocking_issue
proposal.blocked_reasons
```

Si le statut final est `blocked`, regarde:

```text
safety.findings
snapshot.route_recommendation
proposal.blocked_reasons
```

## Étape 6: Localisation Tunisie

Code principal:

- `services/localization/service.py`
- `services/localization/tunisia_localizer.py`
- `services/localization/amm_mapper.py`
- `services/localization/product_ranker.py`
- `services/localization/strength_resolver.py`
- `services/localization/vei_mapper.py`

Sortie:

- `proposal.localized_medications`

La localisation prend une prescription générique, par exemple:

```text
paracetamol 500 mg oral every 8 hours
```

Puis cherche un produit tunisien dans:

```text
final_data_release/final_medicines.csv
```

Logique:

1. classer les produits locaux
2. faire correspondre DCI, forme, dosage, indication
3. choisir la meilleure force/dosage
4. ajouter note de remboursement/VEI si disponible
5. retourner un `LocalizedMedication`

Si la localisation est vide:

- le plan ne contient peut-être pas de médicament
- le cas est peut-être bloqué
- le produit local n'a pas été récupéré
- la DCI générée ne correspond pas aux DCI du catalogue

Inspecte:

```text
draft_plan.medications
evidence.local_products
proposal.localized_medications
localization_skipped_reason
```

Important:

Si le cas est bloqué et que `LOCALIZE_BLOCKED_PLANS=false`, la localisation est sautée volontairement.

## Étape 7: Proposition Finale

Le pipeline construit `PrescriptionProposal`.

Champs principaux:

- `plan`: proposition thérapeutique générique
- `localized_medications`: produits tunisiens correspondants
- `clinician_review_required`: toujours vrai par défaut
- `review_notes`: notes pour le clinicien
- `blocked_reasons`: raisons bloquantes

Statuts possibles:

- `ready_for_review`: proposition prête pour revue clinicien
- `blocked`: proposition bloquée ou non prescrivable automatiquement

Même si `ready_for_review`, le système demande une validation clinicien.

## Étape 8: Audit Et Traçabilité

Code:

- `services/audit/service.py`
- `services/audit/repository.py`

Le pipeline sauvegarde:

- request id
- snapshot clinique
- preuves récupérées
- plan généré
- rapport sécurité
- proposition finale
- trace id
- traces des étapes

Endpoints utiles:

```text
GET /v1/prescriptions/audit/{trace_id}
GET /v1/prescriptions/audit/{trace_id}/review-packet
```

Si tu veux comprendre une décision du système après coup, récupère l'audit par `trace_id`.

## Modèles Utilisés

Dans le profil Kaggle offline:

### Embedding / Vector Search

```text
/kaggle/input/datasets/islemtrigui/cdss-bge-m3
```

Rôle:

- encoder la requête
- interroger le FAISS vector store
- éventuellement servir à la déduplication

### Reranking

```text
/kaggle/input/datasets/islemtrigui/cdss-bge-reranker-v2-m3
```

Rôle:

- reclasser les preuves vectorielles
- reclasser les faits KG
- reclasser les produits locaux

### Traduction

```text
/kaggle/input/datasets/islemtrigui/cdss-nllb-200-distilled-1-3b
```

Rôle:

- traduire texte FR/Tunisien/arabe vers anglais runtime
- améliorer la normalisation clinique

### Génération

```text
/kaggle/working/cdss-qwen3-32b
```

Rôle:

- générer une proposition structurée
- utiliser le contexte patient et les preuves récupérées

Le dossier est préparé depuis les parties:

```text
cdss-qwen3-32b-part-01
cdss-qwen3-32b-part-02
cdss-qwen3-32b-part-03
cdss-qwen3-32b-part-04
cdss-qwen3-32b-part-05
cdss-qwen3-32b-part-06
```

## Données Utilisées

### Données Tunisiennes

```text
final_data_release/
```

Contient:

- médicaments tunisiens
- sections d'évidence
- base SQLite
- exports JSON/JSONL/CSV

Fichiers runtime importants:

```text
final_data_release/final_medicines.csv
final_data_release/final_evidence_sections_runtime.jsonl
final_data_release/final_data_release.db
```

### Vector Store Médical

Kaggle:

```text
/kaggle/input/datasets/islemtrigui6/medical-vector-store-cdss
```

Contient:

```text
all_metadata.pkl
all_texts.pkl
embedding_benchmark.json
medical_knowledge.faiss
medical_knowledge_hnsw_M32_ef128_201
vector_store_stats.json
```

### Knowledge Graph Hetionet + PrimeKG

Kaggle:

```text
/kaggle/input/datasets/islemtrigui6/hetionet-primekg-kuzu-database
```

Préparation:

```bash
python tools/prepare_kaggle_cdss_kg.py
```

Sortie:

```text
/kaggle/working/kg_cdss_review_outputs/cdss_integration_files
```

## Paramètres Importants

Fichier:

```text
.env.kaggle
```

Paramètres principaux:

```text
KG_BACKEND=cdss_csv_dir
KG_CATALOG_PATH=/kaggle/working/kg_cdss_review_outputs/cdss_integration_files

VECTOR_BACKEND=faiss
VECTOR_FAISS_INDEX_PATH=/kaggle/input/datasets/islemtrigui6/medical-vector-store-cdss/medical_knowledge.faiss
VECTOR_FAISS_METADATA_PATH=/kaggle/input/datasets/islemtrigui6/medical-vector-store-cdss/all_metadata.pkl
VECTOR_PICKLE_TEXTS_PATH=/kaggle/input/datasets/islemtrigui6/medical-vector-store-cdss/all_texts.pkl
VECTOR_EMBEDDING_MODEL=/kaggle/input/datasets/islemtrigui/cdss-bge-m3

RERANKER_MODEL=/kaggle/input/datasets/islemtrigui/cdss-bge-reranker-v2-m3
TRANSLATION_MODEL=/kaggle/input/datasets/islemtrigui/cdss-nllb-200-distilled-1-3b
DEDUPLICATION_MODEL=/kaggle/input/datasets/islemtrigui/cdss-bge-m3

GENERATION_BACKEND=transformers
GENERATION_MODEL=/kaggle/working/cdss-qwen3-32b
GENERATION_TEMPERATURE=0.2
GENERATION_MAX_OUTPUT_TOKENS=400
```

Config runtime:

```text
top_k_vector_results=5
top_k_graph_facts=5
max_local_product_candidates=5
require_clinician_review=true
localize_blocked_plans=false
```

## Comment Identifier L'Étape Qui Pose Problème

### Cas 1: Le système ne comprend pas les symptômes

Inspecte:

```text
snapshot.normalized_runtime_text
snapshot.normalized_symptoms
snapshot.suspected_conditions
snapshot.extracted_context.translation_model_status
snapshot.extracted_context.parser_quality
```

Étape concernée:

```text
CLINICAL_UNDERSTANDING
```

### Cas 2: Le système route vers review/emergency alors que tu attendais prescription

Inspecte:

```text
snapshot.route_recommendation
snapshot.missing_critical_information
snapshot.risk_flags
snapshot.extracted_context.red_flags
snapshot.extracted_context.unresolved_flags
```

Étape concernée:

```text
CLINICAL_UNDERSTANDING
```

### Cas 3: Les preuves récupérées sont mauvaises

Inspecte:

```text
evidence.retrieval_plan
evidence.vector_chunks
evidence.graph_facts
evidence.local_products
evidence.merged_summary
```

Étape concernée:

```text
RETRIEVAL
```

### Cas 4: Le vector store ne retourne rien

Inspecte:

```text
VECTOR_BACKEND
VECTOR_FAISS_INDEX_PATH
VECTOR_FAISS_METADATA_PATH
VECTOR_PICKLE_TEXTS_PATH
VECTOR_EMBEDDING_MODEL
evidence.vector_chunks
```

Étape concernée:

```text
RETRIEVAL / vector
```

### Cas 5: Le KG ne retourne rien

Inspecte:

```text
KG_BACKEND
KG_CATALOG_PATH
evidence.graph_facts
```

Vérifie que cette commande a été lancée:

```bash
python tools/prepare_kaggle_cdss_kg.py
```

Étape concernée:

```text
RETRIEVAL / KG
```

### Cas 6: Aucun produit tunisien n'est proposé

Inspecte:

```text
LOCAL_FORMULARY_CATALOG_PATH
evidence.local_products
draft_plan.medications
proposal.localized_medications
```

Étape concernée:

```text
RETRIEVAL / LOCAL_FORMULARY
LOCALIZATION
```

### Cas 7: Le LLM n'est pas utilisé

Inspecte:

```text
draft_plan.generation_notes
GENERATION_BACKEND
GENERATION_MODEL
/kaggle/working/cdss-qwen3-32b
```

Cherche une note:

```text
llm_model_used=true
```

Si absente, le système a probablement utilisé le fallback heuristique.

Étape concernée:

```text
GENERATION
```

### Cas 8: Le LLM propose un médicament mais il disparaît

Inspecte:

```text
snapshot.route_recommendation
draft_plan.unresolved_questions
draft_plan.generation_notes
safety.findings
proposal.blocked_reasons
```

Étapes concernées:

```text
GENERATION
SAFETY
pipeline._enforce_contract_states
```

### Cas 9: La réponse finale est blocked

Inspecte:

```text
result.blocked
result.status
safety.has_blocking_issue
safety.findings
proposal.blocked_reasons
localization_skipped_reason
```

Étape concernée:

```text
SAFETY
CLINICAL_UNDERSTANDING route
```

## Ordre De Test Recommandé Sur Kaggle

Depuis la racine du projet:

```bash
cp .env.kaggle .env
python tools/prepare_kaggle_qwen_model.py
python tools/prepare_kaggle_cdss_kg.py
pip install -e ".[dev]"
uvicorn apps.api.main:app --host 0.0.0.0 --port 8000
```

Ensuite tester:

```text
POST /v1/prescriptions/draft
```

Dans la réponse, inspecter dans cet ordre:

1. `stage_traces`
2. `snapshot.route_recommendation`
3. `snapshot.normalized_symptoms`
4. `evidence.retrieval_plan`
5. `evidence.vector_chunks`
6. `evidence.graph_facts`
7. `evidence.local_products`
8. `draft_plan.medications`
9. `safety.findings`
10. `proposal.localized_medications`

## Résumé Mental Simple

Le système fonctionne comme ceci:

```text
Patient + consultation
  -> traduction / normalisation
  -> extraction symptômes, risques, red flags
  -> décision de route: prescription, review, emergency, non_pharma
  -> recherche preuves: vector store + KG + médicaments Tunisie
  -> reranking modèle
  -> déduplication modèle
  -> prompt avec contexte + preuves
  -> génération Qwen ou fallback
  -> parsing structuré
  -> règles de sécurité
  -> mapping vers produits tunisiens
  -> audit + réponse finale
```

La logique la plus importante:

- La compréhension clinique décide si le cas peut aller vers prescription.
- La récupération décide quelles preuves et quels produits sont disponibles.
- Le LLM propose un plan, mais il ne décide pas seul.
- Les règles de sécurité peuvent bloquer ou supprimer des médicaments.
- La localisation ne fonctionne que si un médicament générique existe et qu'un produit tunisien correspondant est récupéré.

