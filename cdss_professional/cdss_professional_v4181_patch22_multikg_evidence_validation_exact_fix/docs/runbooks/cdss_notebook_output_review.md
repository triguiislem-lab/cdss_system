# Revue de `output cdss_system.ipynb`

Cette revue correspond au notebook execute qui a produit `cdss_test_summary.json`.

## Verdict rapide

Le notebook prouve que l'environnement Kaggle est presque complet: FAISS est installe, Qwen charge, le reranker fonctionne, le KG existe, et le formulaire tunisien repond. Les problemes restants viennent surtout de trois points:

1. Certaines cellules utilisent encore des scripts anciens ou une configuration appliquee trop tard.
2. Le texte clinique contient des caracteres corrompus (`Fi?vre`, `gravit?`), donc le parser ne detecte pas toujours `fever`.
3. Qwen est utilise, mais l'ancien parser/script accepte une sortie non structuree et finit avec `medications: []`.

## Cellules importantes

| Cellule | Etat | Lecture |
|---|---|---|
| 1-5 | OK | Projet, wheels FAISS, installation offline et imports critiques sont OK. |
| 6 | A verifier | `.env` est copie, mais il faut confirmer que `VECTOR_EMBEDDING_MODEL` pointe vers le sous-dossier `/model`. |
| 7 | OK | Qwen est stage dans `/kaggle/working/cdss-qwen3-32b`; KG est extrait. |
| 8 | OK partiel | Des patchs idempotents sont appliques, mais ils ne remplacent pas forcement tous les derniers patchs locaux. |
| 9 | Probleme | `vector_embedding_model = /kaggle/input/datasets/islemtrigui6/s-pubmedbert-ms-marco` sans `/model`. |
| 11-12 | Probleme | Diagnostic FAISS echoue: `Pooling.__init__() missing word_embedding_dimension`. C'est l'ancien diagnostic avec mauvais chemin/mauvais chargement. |
| 14 | OK | Le chargement manuel S-PubMedBert `/model` marche: dimension 768 et retrieval FAISS retourne 5 chunks. |
| 15 | OK | BGE reranker fonctionne. |
| 16 | OK direct | KG direct retourne 5 faits pour `ibuprofen asthma contraindication`. |
| 17 | OK | Formulaire tunisien retourne ADOL/paracetamol. |
| 20 | OK technique, probleme clinique | API repond 200 et propose paracetamol, mais route=`review` car `Fi?vre` devient `fi vre`; symptomes vides. |
| 21-23 | OK | Patchs serialisation numpy/datetime/API appliques. |
| 24 | OK technique, probleme clinique | FAISS+KG+local repond, medications existent, mais KG=0 et route=`review` a cause du symptome non detecte. |
| 26 | Correction tardive | `.env` est corrige vers `/s-pubmedbert-ms-marco/model`, mais apres les diagnostics initiaux. |
| 27 | Correction partielle | Patch JSON pour Qwen metrics, mais pas encore le fallback de generation structuree. |
| 28-30 | Qwen OK, sortie non structuree | Qwen est utilise, vector/local OK, reranker OK, mais `draft_medications=0`. |
| 31-32 | Payload invalide pour test clinique | Le payload contient `Fi?vre`, `gravit?`, `r?nale`, donc le parser detecte `normalized_symptoms=0` et bloque en review. |
| 33 | OK | Resume sauvegarde. |
| 34 | OK | Fin du notebook. |

## Ce qui est prouve par ce run

- `faiss` est installe: version `1.13.2`.
- `sentence_transformers`, `transformers`, `torch`, `accelerate`, `safetensors` sont disponibles.
- Le reranker BGE fonctionne: scores produits.
- Le KG existe et fonctionne en test direct.
- Le formulaire tunisien fonctionne et retrouve ADOL.
- Qwen3-32B est charge et appele par le backend `transformers`.
- FAISS fonctionne si on charge manuellement S-PubMedBert avec pooling explicite.

## Ce qui n'est pas encore valide dans ce run

- Le diagnostic automatique FAISS n'est pas valide, car il a utilise l'ancien chargement.
- La pipeline Qwen n'a pas produit de medicament structure.
- Le cas explicite Qwen n'est pas un bon test, car l'encodage du texte casse `fievre`.
- Le KG n'apparait pas dans la pipeline fever/paracetamol, meme si le KG direct fonctionne.

## Correction recommandee pour le prochain run

Utiliser du texte ASCII dans les payloads Kaggle pour eviter les problemes d'encodage:

```python
doctor_notes = "Fievre depuis 2 jours. Pas d'allergie connue. Non enceinte. Paracetamol traitement symptomatique."
```

Puis verifier que `.env` contient:

```env
VECTOR_EMBEDDING_MODEL=/kaggle/input/datasets/islemtrigui6/s-pubmedbert-ms-marco/model
```

Enfin relancer les cellules dans cet ordre:

1. setup/install/imports
2. `cp .env.kaggle .env`
3. correction `.env` vers `/model`
4. preparation Qwen/KG
5. diagnostics composants
6. smoke API heuristic
7. Qwen metrics
8. resume JSON

