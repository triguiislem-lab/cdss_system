export type Allergie = { substance: string; reaction: string; severite: "legere" | "moderee" | "severe" };
export type Antecedent = { type: "chirurgical" | "medical" | "familial"; description: string; date: string };
export type Traitement = { medicament: string; dosage: string; frequence: string; debut: string; prescripteur: string; actif: boolean };
export type Prescription = {
  id: string; patientId: string; patientNom: string; date: string; medecin: string;
  diagnostic: string; medicaments: PrescriptionMedicament[]; statut: "valide" | "en_attente" | "annule";
  ordonnanceRef: string;
};
export type PrescriptionMedicament = { nom: string; dosage: string; frequence: string; duree: string; instructions: string };
export type Patient = {
  id: string; nom: string; prenom: string; dateNaissance: string; age: number; sexe: "M" | "F";
  cin: string; telephone: string; email: string; adresse: string; ville: string;
  groupeSanguin: string; allergies: Allergie[]; antecedents: Antecedent[];
  traitements: Traitement[]; prescriptions: string[]; medecinId: string;
  dernierVisite: string; statut: "actif" | "inactif";
};

export type Medicament = {
  id: string; nom: string; dci: string; classe: string; formes: string[];
  dosagesDisponibles: string[]; indications: string[]; contreIndications: string[];
  interactionsAvec: string[]; dosageAdulte: string; dosagePersonneAgee?: string;
  dosagePediatrique?: string; surveillance: string; remarque?: string;
};

export const PATIENTS: Patient[] = [
  {
    id: "p1", nom: "Trabelsi", prenom: "Mohamed", dateNaissance: "1975-03-12", age: 49,
    sexe: "M", cin: "04567891", telephone: "+216 22 341 123", email: "m.trabelsi@email.tn",
    adresse: "12 Rue de la Liberté", ville: "Tunis", groupeSanguin: "A+",
    allergies: [
      { substance: "Pénicilline", reaction: "Urticaire, angiooedème", severite: "severe" },
      { substance: "AINS", reaction: "Bronchospasme", severite: "moderee" }
    ],
    antecedents: [
      { type: "medical", description: "Hypertension artérielle depuis 2015", date: "2015-06" },
      { type: "medical", description: "Diabète type 2 depuis 2018", date: "2018-02" },
      { type: "chirurgical", description: "Appendicectomie", date: "1998-07" },
      { type: "familial", description: "Père : infarctus du myocarde", date: "2005-01" }
    ],
    traitements: [
      { medicament: "Metformine", dosage: "1000 mg", frequence: "2x/jour", debut: "2018-03", prescripteur: "Dr. Ahmed Ben Ali", actif: true },
      { medicament: "Ramipril", dosage: "5 mg", frequence: "1x/jour matin", debut: "2015-07", prescripteur: "Dr. Ahmed Ben Ali", actif: true },
      { medicament: "Atorvastatine", dosage: "20 mg", frequence: "1x/jour soir", debut: "2019-01", prescripteur: "Dr. Ahmed Ben Ali", actif: true }
    ],
    prescriptions: ["rx1", "rx3"], medecinId: "d1", dernierVisite: "2025-04-10", statut: "actif"
  },
  {
    id: "p2", nom: "Chaabane", prenom: "Fatima", dateNaissance: "1988-07-22", age: 36,
    sexe: "F", cin: "08923456", telephone: "+216 55 789 234", email: "f.chaabane@email.tn",
    adresse: "5 Avenue Habib Bourguiba", ville: "Sfax", groupeSanguin: "O+",
    allergies: [
      { substance: "Aspirine", reaction: "Épigastralgie", severite: "legere" }
    ],
    antecedents: [
      { type: "medical", description: "Asthme bronchique", date: "2001-09" },
      { type: "medical", description: "Rhinite allergique", date: "2003-04" },
      { type: "familial", description: "Mère : diabète type 2", date: "" }
    ],
    traitements: [
      { medicament: "Béclométasone inhaler", dosage: "250 mcg", frequence: "2x/jour", debut: "2020-05", prescripteur: "Dr. Samar Ben Ali", actif: true },
      { medicament: "Salbutamol inhaler", dosage: "100 mcg", frequence: "si besoin", debut: "2020-05", prescripteur: "Dr. Samar Ben Ali", actif: true }
    ],
    prescriptions: ["rx2"], medecinId: "d1", dernierVisite: "2025-04-22", statut: "actif"
  },
  {
    id: "p3", nom: "Meddeb", prenom: "Karim", dateNaissance: "1962-11-05", age: 62,
    sexe: "M", cin: "02345678", telephone: "+216 98 456 789", email: "k.meddeb@email.tn",
    adresse: "88 Rue Ibn Khaldoun", ville: "Sousse", groupeSanguin: "B-",
    allergies: [],
    antecedents: [
      { type: "medical", description: "Insuffisance coronarienne — stent posé 2020", date: "2020-03" },
      { type: "medical", description: "Hypercholestérolémie", date: "2016-08" },
      { type: "chirurgical", description: "Pontage coronarien", date: "2020-04" }
    ],
    traitements: [
      { medicament: "Aspirine cardio", dosage: "100 mg", frequence: "1x/jour", debut: "2020-04", prescripteur: "Dr. Ahmed Ben Ali", actif: true },
      { medicament: "Clopidogrel", dosage: "75 mg", frequence: "1x/jour", debut: "2020-04", prescripteur: "Dr. Ahmed Ben Ali", actif: true },
      { medicament: "Bisoprolol", dosage: "5 mg", frequence: "1x/jour matin", debut: "2020-04", prescripteur: "Dr. Ahmed Ben Ali", actif: true },
      { medicament: "Atorvastatine", dosage: "40 mg", frequence: "1x/jour soir", debut: "2020-04", prescripteur: "Dr. Ahmed Ben Ali", actif: true }
    ],
    prescriptions: ["rx4"], medecinId: "d1", dernierVisite: "2025-03-28", statut: "actif"
  },
  {
    id: "p4", nom: "Jebali", prenom: "Amira", dateNaissance: "1995-02-14", age: 30,
    sexe: "F", cin: "09876543", telephone: "+216 27 123 456", email: "a.jebali@email.tn",
    adresse: "3 Cité El Menzah", ville: "Ariana", groupeSanguin: "AB+",
    allergies: [
      { substance: "Codéine", reaction: "Nausées sévères, vomissements", severite: "moderee" }
    ],
    antecedents: [
      { type: "medical", description: "Migraine chronique depuis 2015", date: "2015-11" },
      { type: "familial", description: "Migraine — mère et sœur", date: "" }
    ],
    traitements: [
      { medicament: "Topiramate", dosage: "50 mg", frequence: "2x/jour", debut: "2022-06", prescripteur: "Dr. Ahmed Ben Ali", actif: true }
    ],
    prescriptions: [], medecinId: "d1", dernierVisite: "2025-04-30", statut: "actif"
  },
  {
    id: "p5", nom: "Slimani", prenom: "Youssef", dateNaissance: "1950-08-30", age: 74,
    sexe: "M", cin: "00345612", telephone: "+216 71 234 567", email: "y.slimani@email.tn",
    adresse: "17 Rue des Oliviers", ville: "Tunis", groupeSanguin: "A-",
    allergies: [
      { substance: "Sulfamides", reaction: "Éruption cutanée", severite: "moderee" }
    ],
    antecedents: [
      { type: "medical", description: "Insuffisance rénale chronique stade 3", date: "2017-05" },
      { type: "medical", description: "Hypertension artérielle", date: "2010-03" },
      { type: "medical", description: "Arthrose du genou droit", date: "2019-07" },
      { type: "chirurgical", description: "Prothèse totale genou droit", date: "2021-02" }
    ],
    traitements: [
      { medicament: "Amlodipine", dosage: "10 mg", frequence: "1x/jour", debut: "2015-06", prescripteur: "Dr. Ahmed Ben Ali", actif: true },
      { medicament: "Furosémide", dosage: "40 mg", frequence: "1x/jour matin", debut: "2017-06", prescripteur: "Dr. Ahmed Ben Ali", actif: true }
    ],
    prescriptions: [], medecinId: "d1", dernierVisite: "2025-04-15", statut: "actif"
  },
  {
    id: "p6", nom: "Belhaj", prenom: "Sonia", dateNaissance: "1980-05-18", age: 45,
    sexe: "F", cin: "05678901", telephone: "+216 52 345 678", email: "s.belhaj@email.tn",
    adresse: "22 Rue de Carthage", ville: "Tunis", groupeSanguin: "O-",
    allergies: [],
    antecedents: [
      { type: "medical", description: "Hypothyroïdie depuis 2012", date: "2012-09" },
      { type: "medical", description: "Dépression — 2020-2022", date: "2020-03" }
    ],
    traitements: [
      { medicament: "Lévothyroxine", dosage: "75 mcg", frequence: "1x/jour à jeun", debut: "2012-10", prescripteur: "Dr. Ahmed Ben Ali", actif: true }
    ],
    prescriptions: [], medecinId: "d1", dernierVisite: "2025-02-20", statut: "actif"
  },
  {
    id: "p7", nom: "Gharbi", prenom: "Nadia", dateNaissance: "1998-12-03", age: 27,
    sexe: "F", cin: "11234567", telephone: "+216 93 567 890", email: "n.gharbi@email.tn",
    adresse: "9 Avenue de l'Indépendance", ville: "Nabeul", groupeSanguin: "B+",
    allergies: [],
    antecedents: [],
    traitements: [],
    prescriptions: [], medecinId: "d2", dernierVisite: "2025-04-28", statut: "actif"
  },
  {
    id: "p8", nom: "Khelifi", prenom: "Amine", dateNaissance: "1970-09-15", age: 54,
    sexe: "M", cin: "03456789", telephone: "+216 21 678 901", email: "a.khelifi@email.tn",
    adresse: "14 Rue Habib Thameur", ville: "Sfax", groupeSanguin: "A+",
    allergies: [
      { substance: "Latex", reaction: "Urticaire de contact", severite: "moderee" }
    ],
    antecedents: [
      { type: "medical", description: "Diabète type 2 diagnostiqué 2019", date: "2019-04" }
    ],
    traitements: [
      { medicament: "Glipizide", dosage: "5 mg", frequence: "1x/jour avant déjeuner", debut: "2019-05", prescripteur: "Dr. Rania Zouari", actif: true }
    ],
    prescriptions: [], medecinId: "d2", dernierVisite: "2025-04-05", statut: "actif"
  }
];

export const MEDICAMENTS: Medicament[] = [
  {
    id: "m1", nom: "Amoxicilline", dci: "Amoxicilline", classe: "Antibiotique — Pénicilline",
    formes: ["Gélule", "Comprimé", "Sachet pédiatrique", "Injectable"],
    dosagesDisponibles: ["250 mg", "500 mg", "1000 mg"],
    indications: ["Infection respiratoire basse", "Sinusite", "Otite", "Infection urinaire", "Angine streptococcique"],
    contreIndications: ["Allergie aux pénicillines", "Mononucléose infectieuse", "Leucémie lymphoïde"],
    interactionsAvec: ["Warfarine", "Méthotrexate", "Allopurinol"],
    dosageAdulte: "500 mg à 1g toutes les 8h pendant 7-10 jours",
    dosagePediatrique: "40-90 mg/kg/jour en 3 prises",
    surveillance: "Signes d'allergie, fonction rénale si traitement prolongé",
    remarque: "Prendre avec ou sans repas. Vérifier allergie pénicilline."
  },
  {
    id: "m2", nom: "Ibuprofène", dci: "Ibuprofène", classe: "AINS",
    formes: ["Comprimé", "Gélule", "Suspension buvable", "Suppositoire"],
    dosagesDisponibles: ["200 mg", "400 mg", "600 mg"],
    indications: ["Douleur inflammatoire", "Fièvre", "Dysménorrhée", "Arthralgie"],
    contreIndications: ["Ulcère gastroduodénal actif", "Insuffisance rénale sévère", "Asthme aux AINS", "Grossesse T3", "Allergie aux AINS"],
    interactionsAvec: ["Anticoagulants", "Aspirine", "Lithium", "Méthotrexate", "IEC"],
    dosageAdulte: "400-600 mg toutes les 6-8h. Max 2400 mg/jour",
    dosagePersonneAgee: "200-400 mg toutes les 8h. Surveillance rénale. Max 1200 mg/j",
    dosagePediatrique: "7.5-10 mg/kg toutes les 6-8h",
    surveillance: "Fonction rénale, tension artérielle, signes hémorragiques digestifs",
    remarque: "Toujours prendre au cours des repas. Contre-indiqué si asthme aux AINS."
  },
  {
    id: "m3", nom: "Oméprazole", dci: "Oméprazole", classe: "Inhibiteur de la pompe à protons",
    formes: ["Gélule", "Comprimé gastro-résistant", "Injectable"],
    dosagesDisponibles: ["10 mg", "20 mg", "40 mg"],
    indications: ["Ulcère gastroduodénal", "RGO", "Prévention des ulcères aux AINS", "Syndrome de Zollinger-Ellison"],
    contreIndications: ["Hypersensibilité aux IPP"],
    interactionsAvec: ["Clopidogrel", "Méthotrexate", "Fer oral", "Kétoconazole"],
    dosageAdulte: "20-40 mg/jour en une prise le matin à jeun",
    dosagePersonneAgee: "20 mg/jour",
    surveillance: "Magnésémie si traitement prolongé, densité osseuse",
    remarque: "Prendre 30 min avant le repas. Réduire durée au minimum nécessaire."
  },
  {
    id: "m4", nom: "Paracétamol", dci: "Paracétamol (Acétaminophène)", classe: "Analgésique — Antipyrétique",
    formes: ["Comprimé", "Gélule", "Solution buvable", "Suppositoire", "Injectable IV"],
    dosagesDisponibles: ["500 mg", "1000 mg"],
    indications: ["Douleur légère à modérée", "Fièvre", "Céphalées", "Odontalgies"],
    contreIndications: ["Insuffisance hépatique sévère", "Phénylcétonurie (certaines formulations)"],
    interactionsAvec: ["Warfarine (effet anticoagulant augmenté à forte dose)", "Alcool", "Rifampicine"],
    dosageAdulte: "500 mg à 1 g toutes les 4-6h. Max 4 g/jour",
    dosagePersonneAgee: "Max 3 g/jour. Espacer les prises toutes les 6h minimum",
    dosagePediatrique: "15 mg/kg toutes les 6h. Max 60 mg/kg/jour",
    surveillance: "Fonction hépatique si surdosage suspecté",
    remarque: "Médicament de référence en douleur légère à modérée. Respecter les intervalles."
  },
  {
    id: "m5", nom: "Metformine", dci: "Metformine", classe: "Antidiabétique — Biguanide",
    formes: ["Comprimé", "Comprimé LP"],
    dosagesDisponibles: ["500 mg", "850 mg", "1000 mg"],
    indications: ["Diabète type 2 en monothérapie ou combinaison", "Syndrome des ovaires polykystiques"],
    contreIndications: ["Insuffisance rénale (DFG < 30)", "Insuffisance hépatique", "Alcoolisme", "Injection de produit de contraste iodé (arrêt 48h)"],
    interactionsAvec: ["Alcool", "Produits de contraste iodés", "Topiramate"],
    dosageAdulte: "500-850 mg 2-3x/jour au cours des repas. Max 3 g/jour",
    dosagePersonneAgee: "Débuter à 500 mg/jour. Adapter selon DFG. Contrôler créatinine/6 mois",
    surveillance: "HbA1c, créatinine/DFG, vitamine B12 si traitement prolongé",
    remarque: "Prendre au cours des repas pour réduire les troubles digestifs."
  },
  {
    id: "m6", nom: "Amlodipine", dci: "Amlodipine", classe: "Inhibiteur calcique — Dihydropyridine",
    formes: ["Comprimé"],
    dosagesDisponibles: ["5 mg", "10 mg"],
    indications: ["Hypertension artérielle", "Angor stable", "Angor vasospastique"],
    contreIndications: ["Hypotension sévère", "Choc cardiogénique", "Sténose aortique sévère"],
    interactionsAvec: ["Simvastatine (max 20 mg/j)", "Ciclosporine", "Tacrolimus"],
    dosageAdulte: "5-10 mg/jour en une prise",
    dosagePersonneAgee: "Débuter à 2.5-5 mg/jour. Risque d'hypotension orthostatique",
    surveillance: "Tension artérielle, oedèmes des membres inférieurs, fréquence cardiaque",
    remarque: "Effets secondaires : flush, céphalées, oedèmes des chevilles."
  },
  {
    id: "m7", nom: "Warfarine", dci: "Warfarine", classe: "Anticoagulant oral — Anti-vitamine K",
    formes: ["Comprimé"],
    dosagesDisponibles: ["2 mg", "5 mg"],
    indications: ["Fibrillation auriculaire", "Thrombose veineuse profonde", "Embolie pulmonaire", "Valves cardiaques mécaniques"],
    contreIndications: ["Hémorragie active", "Grossesse", "HTA non contrôlée", "Chirurgie récente SNC"],
    interactionsAvec: ["Aspirine", "AINS", "Amoxicilline", "Métronidazole", "Paracétamol forte dose", "Oméprazole", "Amlodipine"],
    dosageAdulte: "Dose initiale 5 mg/jour. Adapter selon INR (cible 2-3)",
    dosagePersonneAgee: "Débuter à 2.5 mg/jour. Risque hémorragique accru. INR cible 2-2.5",
    surveillance: "INR (hebdomadaire au début, mensuel à l'équilibre), signes hémorragiques",
    remarque: "Interactions majeures nombreuses. Régime alimentaire stable (vitamine K). Éducation patient indispensable."
  },
  {
    id: "m8", nom: "Atorvastatine", dci: "Atorvastatine", classe: "Hypolipémiant — Statine",
    formes: ["Comprimé"],
    dosagesDisponibles: ["10 mg", "20 mg", "40 mg", "80 mg"],
    indications: ["Hypercholestérolémie primaire", "Dyslipidémie mixte", "Prévention cardiovasculaire"],
    contreIndications: ["Hépatopathie active", "Grossesse", "Allaitement"],
    interactionsAvec: ["Amlodipine (simvastatine uniquement)", "Macrolides", "Antifongiques azolés", "Ciclosporine"],
    dosageAdulte: "10-40 mg/jour en une prise le soir. Max 80 mg en prévention CV secondaire",
    dosagePersonneAgee: "Même dose adulte. Surveiller myalgies et CPK si symptômes",
    surveillance: "Bilan hépatique (début, 3 mois, puis annuel), CPK si myalgies, bilan lipidique",
    remarque: "Prendre à n'importe quelle heure, de préférence le soir. Signaler toute douleur musculaire."
  },
  {
    id: "m9", nom: "Amoxicilline + Acide Clavulanique", dci: "Amoxicilline/Clavulanate", classe: "Antibiotique — Pénicilline + inhibiteur β-lactamase",
    formes: ["Comprimé", "Sachet", "Injectable"],
    dosagesDisponibles: ["500/125 mg", "875/125 mg", "1000/200 mg"],
    indications: ["Sinusite bactérienne", "Otite moyenne aiguë récidivante", "Pneumonie communautaire", "Infection urinaire compliquée", "Infection cutanée"],
    contreIndications: ["Allergie aux pénicillines", "Antécédent de cholestase à l'Augmentin"],
    interactionsAvec: ["Warfarine", "Méthotrexate", "Anticoagulants oraux"],
    dosageAdulte: "875/125 mg toutes les 12h ou 500/125 mg toutes les 8h pendant 5-10 jours",
    dosagePersonneAgee: "875/125 mg toutes les 12h. Adapter si insuffisance rénale",
    surveillance: "Fonction hépatique si traitement prolongé, signes d'allergie",
    remarque: "Prendre en début de repas. Vérifier antécédents allergiques aux pénicillines."
  },
  {
    id: "m10", nom: "Ceftriaxone", dci: "Ceftriaxone", classe: "Antibiotique — Céphalosporine 3G",
    formes: ["Injectable IM", "Injectable IV"],
    dosagesDisponibles: ["500 mg", "1 g", "2 g"],
    indications: ["Pneumonie sévère", "Méningite bactérienne", "Septicémie", "Infection ostéo-articulaire"],
    contreIndications: ["Allergie aux céphalosporines", "Hyperbilirubinémie du nouveau-né (IV)", "Administration avec calcium IV chez le nouveau-né"],
    interactionsAvec: ["Aminoglycosides (néphrotoxicité additionnelle)", "Anticoagulants"],
    dosageAdulte: "1-2 g/jour IM ou IV en une prise. 2-4 g/jour en cas de méningite",
    dosagePersonneAgee: "Même dose adulte. Surveillance de la fonction rénale",
    surveillance: "NFS, bilan rénal, bilan hépatique si traitement prolongé",
    remarque: "Allergie croisée possible avec pénicillines (5-10%). Solution à base de lidocaïne pour voie IM."
  }
];

export const INTERACTIONS_CONNUES: { [key: string]: { avec: string; niveau: "majeure" | "moderee" | "mineure"; description: string }[] } = {
  "Warfarine": [
    { avec: "Aspirine", niveau: "majeure", description: "Risque hémorragique majeur. Association déconseillée sauf indication cardiologique spécifique." },
    { avec: "AINS", niveau: "majeure", description: "Potentialisation de l'effet anticoagulant + risque d'hémorragie digestive." },
    { avec: "Amoxicilline", niveau: "moderee", description: "Modification de la flore intestinale pouvant augmenter l'effet anticoagulant. Surveiller INR." },
    { avec: "Amoxicilline + Acide Clavulanique", niveau: "moderee", description: "Modification de la flore intestinale. Contrôler l'INR dans les 3-4 jours." },
    { avec: "Ibuprofène", niveau: "majeure", description: "Risque hémorragique très élevé. Contre-indication pratique." },
    { avec: "Oméprazole", niveau: "mineure", description: "Légère augmentation de l'effet anticoagulant possible. Surveiller INR." },
    { avec: "Paracétamol", niveau: "moderee", description: "Doses > 2g/jour peuvent augmenter l'INR. Préférer dose minimale efficace." }
  ],
  "Metformine": [
    { avec: "Alcool", niveau: "majeure", description: "Risque d'acidose lactique augmenté. Déconseiller la consommation d'alcool." },
    { avec: "Topiramate", niveau: "moderee", description: "Acidose métabolique possible. Surveiller bicarbonates." }
  ],
  "Amlodipine": [
    { avec: "Warfarine", niveau: "mineure", description: "Légère augmentation de l'effet anticoagulant. Surveiller INR." },
    { avec: "Simvastatine", niveau: "moderee", description: "Augmentation des concentrations de simvastatine. Limiter simvastatine à 20 mg/jour." }
  ],
  "Clopidogrel": [
    { avec: "Oméprazole", niveau: "moderee", description: "Réduction de l'effet antiagrégeant plaquettaire du clopidogrel. Préférer pantoprazole si IPP nécessaire." },
    { avec: "Aspirine", niveau: "moderee", description: "Synergie antiagrégeante. Association justifiée en cardiologie mais risque hémorragique accru." }
  ],
  "Ibuprofène": [
    { avec: "Aspirine", niveau: "moderee", description: "Réduction de l'effet cardioprotecteur de l'aspirine. Éviter l'association." },
    { avec: "Warfarine", niveau: "majeure", description: "Risque hémorragique très élevé." }
  ]
};

export const PRESCRIPTIONS: Prescription[] = [
  {
    id: "rx1", patientId: "p1", patientNom: "Trabelsi Mohamed", date: "2025-04-10",
    medecin: "Dr. Ahmed Ben Ali", diagnostic: "Infection respiratoire haute — rhinosinusite aiguë",
    medicaments: [
      { nom: "Amoxicilline + Acide Clavulanique", dosage: "875/125 mg", frequence: "2x/jour", duree: "7 jours", instructions: "Prendre au début du repas" },
      { nom: "Paracétamol", dosage: "1000 mg", frequence: "3x/jour si douleur", duree: "5 jours", instructions: "Max 4g/jour. Espacer de 6h minimum" },
      { nom: "Oméprazole", dosage: "20 mg", frequence: "1x/jour matin", duree: "7 jours", instructions: "Prendre 30 min avant le petit déjeuner" }
    ],
    statut: "valide", ordonnanceRef: "ORD-2025-0410-001"
  },
  {
    id: "rx2", patientId: "p2", patientNom: "Chaabane Fatima", date: "2025-04-22",
    medecin: "Dr. Ahmed Ben Ali", diagnostic: "Exacerbation d'asthme légère",
    medicaments: [
      { nom: "Salbutamol inhaler", dosage: "100 mcg", frequence: "4x/jour pendant 5 jours puis si besoin", duree: "5 jours traitement, puis à la demande", instructions: "2 bouffées par prise. Rincer la bouche" },
      { nom: "Prednisolone", dosage: "40 mg", frequence: "1x/jour le matin", duree: "5 jours", instructions: "Prendre avec le repas" }
    ],
    statut: "valide", ordonnanceRef: "ORD-2025-0422-002"
  },
  {
    id: "rx3", patientId: "p1", patientNom: "Trabelsi Mohamed", date: "2025-01-15",
    medecin: "Dr. Ahmed Ben Ali", diagnostic: "Renouvellement traitements chroniques — HTA + Diabète T2",
    medicaments: [
      { nom: "Metformine", dosage: "1000 mg", frequence: "2x/jour", duree: "3 mois", instructions: "Prendre au cours des repas" },
      { nom: "Ramipril", dosage: "5 mg", frequence: "1x/jour matin", duree: "3 mois", instructions: "Surveiller tension et potassium" },
      { nom: "Atorvastatine", dosage: "20 mg", frequence: "1x/jour soir", duree: "3 mois", instructions: "Signaler tout douleur musculaire" }
    ],
    statut: "valide", ordonnanceRef: "ORD-2025-0115-003"
  },
  {
    id: "rx4", patientId: "p3", patientNom: "Meddeb Karim", date: "2025-03-28",
    medecin: "Dr. Ahmed Ben Ali", diagnostic: "Suivi post-stent coronarien — renouvellement bithérapie antiplaquettaire",
    medicaments: [
      { nom: "Aspirine cardio", dosage: "100 mg", frequence: "1x/jour", duree: "3 mois", instructions: "Ne pas interrompre sans avis médical" },
      { nom: "Clopidogrel", dosage: "75 mg", frequence: "1x/jour", duree: "3 mois", instructions: "Association avec aspirine maintenue selon recommandations cardiologiques" }
    ],
    statut: "valide", ordonnanceRef: "ORD-2025-0328-004"
  }
];

export const STATS_ADMIN = {
  totalPatients: 248,
  totalMedecins: 34,
  consultationsAujourdHui: 42,
  consultationsSemaine: 187,
  prescriptionsEmises: 1243,
  prescriptionsEnAttente: 8,
  tauxConformite: 98.2,
  patientActifs: 211,
  alertesInteractions: 3,
  teleconsultations: 67,
};

export const STATS_DOCTOR = {
  patientsTotal: 87,
  rdvAujourdHui: 8,
  rdvCompletes: 5,
  prescriptionsEmises: 143,
  alertesActives: 2,
  prochainRdv: "Mohamed Trabelsi — 14h30",
};

export type AgendaRdvType = "teleconsultation" | "presentiel";
export type AgendaRdvStatut = "termine" | "en_cours" | "en_attente";
export interface AgendaRdv {
  heure: string;
  patient: string;
  motif: string;
  statut: AgendaRdvStatut;
  type: AgendaRdvType;
}

export const AGENDA_MEDECIN: AgendaRdv[] = [
  { heure: "08h30", patient: "Karim Meddeb", motif: "Suivi cardiologique", statut: "termine", type: "presentiel" },
  { heure: "09h00", patient: "Fatima Chaabane", motif: "Exacerbation asthme", statut: "termine", type: "teleconsultation" },
  { heure: "09h30", patient: "Sonia Belhaj", motif: "Renouvellement ordonnance", statut: "termine", type: "teleconsultation" },
  { heure: "10h00", patient: "Amine Khelifi", motif: "Bilan diabétique", statut: "termine", type: "presentiel" },
  { heure: "10h30", patient: "Nadia Gharbi", motif: "Consultation initiale", statut: "en_cours", type: "presentiel" },
  { heure: "11h00", patient: "Mohamed Trabelsi", motif: "Douleurs thoraciques", statut: "en_attente", type: "teleconsultation" },
  { heure: "11h30", patient: "Amira Jebali", motif: "Migraine — suivi", statut: "en_attente", type: "presentiel" },
  { heure: "14h30", patient: "Youssef Slimani", motif: "Suivi IRC", statut: "en_attente", type: "presentiel" },
];
