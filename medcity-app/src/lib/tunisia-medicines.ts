export type DrugClass = string;

export interface TunisianMedicine {
  id: string;
  sourceMedicineId?: string;
  sourceKey?: string;
  localProductName?: string;
  dci: string; // International Nonproprietary Name
  brands: string[]; // commercial names available in Tunisia
  atcCode: string;
  drugClass: DrugClass;
  therapeuticSubclass?: string;
  forms: string[]; // pharmaceutical forms / dosages
  laboratories: string[]; // local manufacturers/distributors
  dosage?: string;
  form?: string;
  presentation?: string;
  amm?: string;
  ammDate?: string;
  genericStatus?: string;
  tableau?: string;
  veicStatus?: string;
  conservationDurationMonths?: string;
  primaryPackaging?: string;
  packagingSpecification?: string;
  reimbursement: "100%" | "85%" | "40%" | "0%";
  reimbursementCategory?: string;
  reimbursementRatePercent?: number;
  referenceTariffTnd?: number;
  publicPriceMinTnd?: number;
  publicPriceMaxTnd?: number;
  indication: string;
  contraindications: string[];
  posologyAdult: string;
  pregnancy: "Autorisé" | "Précaution" | "Contre-indiqué";
  renalAdjust: boolean;
  hepaticAdjust: boolean;
  priceTndApprox: number; // average box price in TND
  detailUrl?: string;
  rcpUrl?: string;
  noticeUrl?: string;
  sourceReference?: string;
  sourceSystems?: string[];
}

export const drugClasses: DrugClass[] = [
  "Antibiotique",
  "Antalgique",
  "Anti-inflammatoire",
  "Antihypertenseur",
  "Antidiabétique",
  "Anticoagulant",
  "Antiépileptique",
  "Antiasthmatique",
  "Cardiologie",
  "Gastro-entérologie",
  "Psychiatrie",
  "Hormonothérapie",
];

export const tunisianMedicines: TunisianMedicine[] = [
  {
    id: "TN-001", dci: "Amoxicilline", brands: ["Clamoxyl", "Hiconcil", "Amoxil TN"], atcCode: "J01CA04",
    drugClass: "Antibiotique", forms: ["500 mg gél.", "1 g cp.", "Sirop 250 mg/5 ml"],
    laboratories: ["SAIPH", "Médis", "Adwya"], reimbursement: "100%",
    indication: "Infections ORL, pulmonaires, urinaires à germes sensibles.",
    contraindications: ["Allergie aux β-lactamines"],
    posologyAdult: "1 g x 2 à 3/jour PO pendant 7 jours.",
    pregnancy: "Autorisé", renalAdjust: true, hepaticAdjust: false, priceTndApprox: 8.5,
  },
  {
    id: "TN-002", dci: "Amoxicilline + Ac. clavulanique", brands: ["Augmentin", "Clavulin", "Bioclavid"],
    atcCode: "J01CR02", drugClass: "Antibiotique", forms: ["1 g cp.", "Sirop 100/12.5 mg/ml"],
    laboratories: ["SAIPH", "Médis", "Opalia"], reimbursement: "100%",
    indication: "Infections respiratoires basses, sinusites, IU compliquées.",
    contraindications: ["Allergie pénicilline", "ATCD ictère cholestatique"],
    posologyAdult: "1 g x 2/jour PO pendant 7-10 jours.",
    pregnancy: "Précaution", renalAdjust: true, hepaticAdjust: true, priceTndApprox: 14.2,
  },
  {
    id: "TN-003", dci: "Paracétamol", brands: ["Doliprane", "Efferalgan", "Panadol", "Doliprane Tunisie"],
    atcCode: "N02BE01", drugClass: "Antalgique", forms: ["500 mg cp.", "1 g cp.", "Sachet 1 g"],
    laboratories: ["Adwya", "SAIPH", "Médis", "Unimed"], reimbursement: "40%",
    indication: "Douleurs légères à modérées, fièvre.",
    contraindications: ["Insuffisance hépatocellulaire sévère"],
    posologyAdult: "500 mg à 1 g x 3-4/jour, max 4 g/24 h.",
    pregnancy: "Autorisé", renalAdjust: false, hepaticAdjust: true, priceTndApprox: 2.8,
  },
  {
    id: "TN-004", dci: "Ibuprofène", brands: ["Brufen", "Spedifen", "Nurofen"],
    atcCode: "M01AE01", drugClass: "Anti-inflammatoire", forms: ["400 mg cp.", "600 mg cp.", "Sirop 100 mg/5 ml"],
    laboratories: ["Adwya", "SAIPH", "Médis"], reimbursement: "40%",
    indication: "Douleur, fièvre, inflammation rhumatologique.",
    contraindications: ["Ulcère gastroduodénal évolutif", "Insuffisance rénale sévère", "3e trimestre grossesse"],
    posologyAdult: "400 mg x 3/jour PO au cours du repas.",
    pregnancy: "Contre-indiqué", renalAdjust: true, hepaticAdjust: false, priceTndApprox: 4.6,
  },
  {
    id: "TN-005", dci: "Amlodipine", brands: ["Amlor", "Norvasc", "Amlodi-TN"],
    atcCode: "C08CA01", drugClass: "Antihypertenseur", forms: ["5 mg cp.", "10 mg cp."],
    laboratories: ["SAIPH", "Médis", "Opalia"], reimbursement: "100%",
    indication: "Hypertension artérielle, angor stable.",
    contraindications: ["Choc cardiogénique", "RA sévère"],
    posologyAdult: "5 à 10 mg/jour PO en 1 prise.",
    pregnancy: "Précaution", renalAdjust: false, hepaticAdjust: true, priceTndApprox: 9.3,
  },
  {
    id: "TN-006", dci: "Lisinopril", brands: ["Zestril", "Prinivil"], atcCode: "C09AA03",
    drugClass: "Antihypertenseur", forms: ["5 mg cp.", "20 mg cp."],
    laboratories: ["SAIPH", "Adwya"], reimbursement: "100%",
    indication: "HTA, insuffisance cardiaque, post-IDM.",
    contraindications: ["Grossesse", "Angio-œdème ATCD", "Sténose bilatérale art. rénales"],
    posologyAdult: "10-20 mg/jour PO.",
    pregnancy: "Contre-indiqué", renalAdjust: true, hepaticAdjust: false, priceTndApprox: 7.8,
  },
  {
    id: "TN-007", dci: "Metformine", brands: ["Glucophage", "Stagid", "Metfor-TN"],
    atcCode: "A10BA02", drugClass: "Antidiabétique", forms: ["500 mg cp.", "850 mg cp.", "1000 mg cp."],
    laboratories: ["Médis", "SAIPH", "Adwya", "Unimed"], reimbursement: "100%",
    indication: "Diabète de type 2, première intention.",
    contraindications: ["DFG < 30 mL/min", "Acidose métabolique", "Insuffisance hépatique sévère"],
    posologyAdult: "500-1000 mg x 2-3/jour PO au repas.",
    pregnancy: "Autorisé", renalAdjust: true, hepaticAdjust: true, priceTndApprox: 6.5,
  },
  {
    id: "TN-008", dci: "Gliclazide", brands: ["Diamicron", "Glydium"], atcCode: "A10BB09",
    drugClass: "Antidiabétique", forms: ["30 mg LM cp.", "60 mg LM cp."],
    laboratories: ["Médis", "Opalia"], reimbursement: "100%",
    indication: "Diabète de type 2 en bithérapie.",
    contraindications: ["Insuffisance rénale sévère", "Insuffisance hépatique sévère", "Allaitement"],
    posologyAdult: "30 à 120 mg/jour PO en 1 prise au petit-déjeuner.",
    pregnancy: "Contre-indiqué", renalAdjust: true, hepaticAdjust: true, priceTndApprox: 11.0,
  },
  {
    id: "TN-009", dci: "Warfarine", brands: ["Coumadine"], atcCode: "B01AA03",
    drugClass: "Anticoagulant", forms: ["2 mg cp.", "5 mg cp."],
    laboratories: ["SAIPH"], reimbursement: "100%",
    indication: "ACFA, prévention thromboembolique, valves mécaniques.",
    contraindications: ["Hémorragie active", "HTA non contrôlée", "Grossesse T1/T3"],
    posologyAdult: "Dose individualisée selon INR cible 2-3.",
    pregnancy: "Contre-indiqué", renalAdjust: false, hepaticAdjust: true, priceTndApprox: 9.6,
  },
  {
    id: "TN-010", dci: "Apixaban", brands: ["Eliquis"], atcCode: "B01AF02",
    drugClass: "Anticoagulant", forms: ["2.5 mg cp.", "5 mg cp."],
    laboratories: ["Pfizer / Distributeur Tunisie"], reimbursement: "85%",
    indication: "ACFA non valvulaire, MTEV.",
    contraindications: ["Hémorragie active", "Insuffisance hépatique Child C"],
    posologyAdult: "5 mg x 2/jour PO (2.5 mg x 2 si critères).",
    pregnancy: "Contre-indiqué", renalAdjust: true, hepaticAdjust: true, priceTndApprox: 78.0,
  },
  {
    id: "TN-011", dci: "Atorvastatine", brands: ["Tahor", "Lipitor", "Atorva-TN"],
    atcCode: "C10AA05", drugClass: "Cardiologie", forms: ["10 mg cp.", "20 mg cp.", "40 mg cp."],
    laboratories: ["Médis", "SAIPH", "Adwya"], reimbursement: "100%",
    indication: "Hypercholestérolémie, prévention CV.",
    contraindications: ["Hépatopathie active", "Grossesse"],
    posologyAdult: "10-40 mg/jour PO le soir.",
    pregnancy: "Contre-indiqué", renalAdjust: false, hepaticAdjust: true, priceTndApprox: 13.5,
  },
  {
    id: "TN-012", dci: "Oméprazole", brands: ["Mopral", "Inipomp", "Omépra-TN"],
    atcCode: "A02BC01", drugClass: "Gastro-entérologie", forms: ["20 mg gél.", "40 mg gél."],
    laboratories: ["Médis", "Adwya", "Unimed"], reimbursement: "85%",
    indication: "RGO, ulcère, éradication H. pylori.",
    contraindications: ["Hypersensibilité aux IPP"],
    posologyAdult: "20 mg/jour PO 30 min avant repas.",
    pregnancy: "Autorisé", renalAdjust: false, hepaticAdjust: true, priceTndApprox: 10.2,
  },
  {
    id: "TN-013", dci: "Salbutamol", brands: ["Ventoline", "Salbu-TN"], atcCode: "R03AC02",
    drugClass: "Antiasthmatique", forms: ["Aérosol 100 µg/dose", "Sol. neb. 5 mg/ml"],
    laboratories: ["SAIPH", "Adwya"], reimbursement: "100%",
    indication: "Crise d'asthme, BPCO, bronchospasme.",
    contraindications: ["Hypersensibilité"],
    posologyAdult: "1 à 2 bouffées en cas de crise, max 8/24 h.",
    pregnancy: "Autorisé", renalAdjust: false, hepaticAdjust: false, priceTndApprox: 6.8,
  },
  {
    id: "TN-014", dci: "Lévothyroxine", brands: ["Levothyrox", "L-Thyroxine"], atcCode: "H03AA01",
    drugClass: "Hormonothérapie", forms: ["25 µg cp.", "50 µg cp.", "75 µg cp.", "100 µg cp."],
    laboratories: ["Merck", "SAIPH"], reimbursement: "100%",
    indication: "Hypothyroïdie, post-thyroïdectomie.",
    contraindications: ["Thyrotoxicose non traitée", "IDM récent"],
    posologyAdult: "1.6 µg/kg/jour PO le matin à jeun.",
    pregnancy: "Autorisé", renalAdjust: false, hepaticAdjust: false, priceTndApprox: 5.2,
  },
  {
    id: "TN-015", dci: "Sertraline", brands: ["Zoloft", "Serlift"], atcCode: "N06AB06",
    drugClass: "Psychiatrie", forms: ["50 mg cp.", "100 mg cp."],
    laboratories: ["Pfizer / Distributeur Tunisie", "Adwya"], reimbursement: "85%",
    indication: "Dépression, TOC, trouble anxieux.",
    contraindications: ["Association IMAO", "Hypersensibilité"],
    posologyAdult: "50-200 mg/jour PO.",
    pregnancy: "Précaution", renalAdjust: false, hepaticAdjust: true, priceTndApprox: 22.4,
  },
  {
    id: "TN-016", dci: "Carbamazépine", brands: ["Tegretol"], atcCode: "N03AF01",
    drugClass: "Antiépileptique", forms: ["200 mg cp.", "400 mg LP cp."],
    laboratories: ["Novartis / Distributeur Tunisie"], reimbursement: "100%",
    indication: "Épilepsie, névralgie du trijumeau.",
    contraindications: ["BAV", "ATCD aplasie médullaire", "Porphyrie"],
    posologyAdult: "400 à 1200 mg/jour en 2-3 prises.",
    pregnancy: "Précaution", renalAdjust: false, hepaticAdjust: true, priceTndApprox: 12.7,
  },
  {
    id: "TN-017", dci: "Furosémide", brands: ["Lasilix", "Furo-TN"], atcCode: "C03CA01",
    drugClass: "Cardiologie", forms: ["20 mg cp.", "40 mg cp.", "Inj. 20 mg/2 ml"],
    laboratories: ["SAIPH", "Médis"], reimbursement: "100%",
    indication: "OAP, insuffisance cardiaque, œdèmes.",
    contraindications: ["Anurie", "Hypovolémie sévère", "Hypokaliémie sévère"],
    posologyAdult: "20-80 mg/jour PO ou IV selon réponse.",
    pregnancy: "Précaution", renalAdjust: true, hepaticAdjust: true, priceTndApprox: 5.5,
  },
  {
    id: "TN-018", dci: "Azithromycine", brands: ["Zithromax", "Azi-TN"], atcCode: "J01FA10",
    drugClass: "Antibiotique", forms: ["250 mg cp.", "500 mg cp.", "Sirop 200 mg/5 ml"],
    laboratories: ["Médis", "SAIPH"], reimbursement: "85%",
    indication: "Infections respiratoires, ORL, génitales atypiques.",
    contraindications: ["Hypersensibilité macrolides", "Allongement QT"],
    posologyAdult: "500 mg J1 puis 250 mg J2-J5 PO.",
    pregnancy: "Précaution", renalAdjust: false, hepaticAdjust: true, priceTndApprox: 15.8,
  },
];
