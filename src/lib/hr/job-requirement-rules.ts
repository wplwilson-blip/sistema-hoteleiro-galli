export type HrJobRequirementRuleGroup =
  | "administrative"
  | "reception"
  | "kitchen_food_beverage"
  | "housekeeping_general_services"
  | "laundry"
  | "maintenance"
  | "security";

export type HrJobRequirementLevel = "required" | "recommended" | "confirm_with_sst" | "conditional";

export type HrJobRequirementType =
  | "document"
  | "training"
  | "occupational_health"
  | "uniform"
  | "epi"
  | "onboarding"
  | "alert";

export type HrJobRequirementCondition =
  | "performs_electrical_work"
  | "works_above_2m"
  | "handles_food"
  | "uses_chemical_products"
  | "uses_cutting_tools"
  | "works_with_heat"
  | "works_in_laundry_noise"
  | "security_periculosidade_review";

export type HrJobRequirementSourceBase = "PGR" | "PCMSO" | "LTCAT" | "LAUDO_INSALUBRIDADE" | "LAUDO_PERICULOSIDADE" | "MATRIZ_RH_30B" | "OPERACAO_HOTEL";

export type HrJobRequirementItem = {
  key: string;
  name: string;
  level: HrJobRequirementLevel;
  condition?: HrJobRequirementCondition;
  sourceBase: HrJobRequirementSourceBase[];
  notes?: string;
};

export type HrTrainingRequirementItem = HrJobRequirementItem & {
  validityDays?: number;
  alertBeforeDays?: number;
};

export type HrAlertRequirementItem = HrJobRequirementItem & {
  alertBeforeDays?: number;
  targetRequirementKey?: string;
};

export type HrJobRequirementRule = {
  ruleGroup: HrJobRequirementRuleGroup;
  sector: string;
  jobTitles: string[];
  cboCodes: string[];
  departmentHints: string[];
  riskTags: string[];
  riskDescription: string;
  sourceBase: HrJobRequirementSourceBase[];
  documentRequirements: HrJobRequirementItem[];
  trainingRequirements: HrTrainingRequirementItem[];
  occupationalHealthRequirements: HrJobRequirementItem[];
  uniformRequirements: HrJobRequirementItem[];
  epiRequirements: HrJobRequirementItem[];
  onboardingRequirements: HrJobRequirementItem[];
  alertRules: HrAlertRequirementItem[];
};

export type FindJobRequirementRuleInput = {
  jobTitle?: string | null;
  cboCode?: string | null;
  sector?: string | null;
  department?: string | null;
  ruleGroup?: HrJobRequirementRuleGroup | null;
};

const source = {
  matrix: ["MATRIZ_RH_30B"] satisfies HrJobRequirementSourceBase[],
  pcmsopgr: ["PCMSO", "PGR", "MATRIZ_RH_30B"] satisfies HrJobRequirementSourceBase[],
  operation: ["OPERACAO_HOTEL", "MATRIZ_RH_30B"] satisfies HrJobRequirementSourceBase[],
  reports: ["PGR", "PCMSO", "LTCAT", "LAUDO_INSALUBRIDADE", "LAUDO_PERICULOSIDADE", "MATRIZ_RH_30B"] satisfies HrJobRequirementSourceBase[]
};

const commonDocuments: HrJobRequirementItem[] = [
  { key: "employee_manual_acknowledgement", name: "Ciencia do manual do colaborador", level: "recommended", sourceBase: source.operation },
  { key: "conduct_policy_acknowledgement", name: "Ciencia da politica de conduta", level: "recommended", sourceBase: source.operation }
];

const lgpdDocument: HrJobRequirementItem = {
  key: "confidentiality_lgpd_acknowledgement",
  name: "Termo de confidencialidade e LGPD",
  level: "recommended",
  sourceBase: source.operation,
  notes: "Aplicar especialmente para areas com dados administrativos, hospedes, colaboradores ou fornecedores."
};

const clinicalExamSet: HrJobRequirementItem[] = [
  { key: "clinical_exam_admission", name: "Exame clinico admissional", level: "required", sourceBase: ["PCMSO", "MATRIZ_RH_30B"] },
  { key: "clinical_exam_periodic", name: "Exame clinico periodico", level: "required", sourceBase: ["PCMSO", "MATRIZ_RH_30B"] },
  { key: "clinical_exam_return_to_work", name: "Exame clinico de retorno ao trabalho", level: "required", sourceBase: ["PCMSO", "MATRIZ_RH_30B"] },
  { key: "clinical_exam_risk_change", name: "Exame clinico de mudanca de risco", level: "required", sourceBase: ["PCMSO", "MATRIZ_RH_30B"] },
  { key: "clinical_exam_termination", name: "Exame clinico demissional", level: "required", sourceBase: ["PCMSO", "MATRIZ_RH_30B"] }
];

const integrationTraining: HrTrainingRequirementItem = {
  key: "integration",
  name: "Integracao institucional",
  level: "recommended",
  sourceBase: source.operation
};

const ergonomicsTraining: HrTrainingRequirementItem = {
  key: "ergonomics_posture",
  name: "Ergonomia e postura",
  level: "recommended",
  alertBeforeDays: 30,
  sourceBase: source.pcmsopgr
};

const nr06Training: HrTrainingRequirementItem = {
  key: "nr06_epi",
  name: "NR-06 / Uso correto de EPI",
  level: "required",
  alertBeforeDays: 30,
  sourceBase: source.pcmsopgr
};

const commonOnboarding: HrJobRequirementItem[] = [
  { key: "institutional_integration", name: "Integracao institucional", level: "recommended", sourceBase: source.operation },
  { key: "employee_manual", name: "Ciencia do manual do colaborador", level: "recommended", sourceBase: source.operation },
  { key: "conduct_policy", name: "Ciencia da politica de conduta", level: "recommended", sourceBase: source.operation }
];

const standardUniformRequirement: HrJobRequirementItem = {
  key: "operational_uniform",
  name: "Uniforme operacional",
  level: "required",
  sourceBase: source.operation,
  notes: "Uniforme obrigatorio conforme padrao operacional da unidade."
};

const commonAlerts: HrAlertRequirementItem[] = [
  { key: "periodic_aso_due", name: "Alerta de ASO periodico", level: "required", alertBeforeDays: 30, targetRequirementKey: "clinical_exam_periodic", sourceBase: ["PCMSO", "MATRIZ_RH_30B"] }
];

export const hrJobRequirementRules: HrJobRequirementRule[] = [
  {
    ruleGroup: "administrative",
    sector: "Administrativo / Financeiro / RH / DP / Comercial",
    jobTitles: [
      "Analista Financeiro",
      "Assistente Administrativo",
      "Assistente de Recursos Humanos",
      "Auxiliar de Departamento Pessoal",
      "Assistente Comercial",
      "Assistente de Compras",
      "Gerente Operacional"
    ],
    cboCodes: ["confirmar"],
    departmentHints: ["administrativo", "financeiro", "rh", "recursos humanos", "departamento pessoal", "dp", "comercial", "compras", "operacional"],
    riskTags: ["ergonomic", "postural", "seated_work"],
    riskDescription: "Risco ergonomico/postural por trabalho sentado e uso de computador.",
    sourceBase: source.pcmsopgr,
    documentRequirements: [...commonDocuments, lgpdDocument],
    trainingRequirements: [
      integrationTraining,
      ergonomicsTraining,
      { key: "employee_manual_training", name: "Manual do colaborador", level: "recommended", sourceBase: source.operation },
      { key: "lgpd_confidentiality", name: "LGPD e sigilo administrativo", level: "recommended", sourceBase: source.operation }
    ],
    occupationalHealthRequirements: clinicalExamSet,
    uniformRequirements: [standardUniformRequirement],
    epiRequirements: [],
    onboardingRequirements: [...commonOnboarding, { key: "lgpd_acknowledgement", name: "Ciencia LGPD/sigilo", level: "recommended", sourceBase: source.operation }],
    alertRules: [
      ...commonAlerts,
      { key: "ergonomics_training_due", name: "Alerta de treinamento de ergonomia", level: "recommended", alertBeforeDays: 30, targetRequirementKey: "ergonomics_posture", sourceBase: source.pcmsopgr },
      { key: "manual_acknowledgement_pending", name: "Alerta de ciencia do manual", level: "recommended", alertBeforeDays: 7, targetRequirementKey: "employee_manual_acknowledgement", sourceBase: source.operation }
    ]
  },
  {
    ruleGroup: "reception",
    sector: "Recepcao",
    jobTitles: ["Recepcionista de Hotel", "Lider de Recepcao"],
    cboCodes: ["422120", "confirmar"],
    departmentHints: ["recepcao", "front desk", "atendimento"],
    riskTags: ["ergonomic", "postural", "standing_work", "guest_service", "conflict_service"],
    riskDescription: "Risco ergonomico/postural por permanencia em pe, atendimento ao hospede e situacoes de conflito.",
    sourceBase: source.pcmsopgr,
    documentRequirements: [...commonDocuments, lgpdDocument],
    trainingRequirements: [
      integrationTraining,
      { key: "guest_service", name: "Atendimento ao hospede", level: "recommended", alertBeforeDays: 30, sourceBase: source.operation },
      { key: "lgpd_confidentiality", name: "LGPD e sigilo no atendimento", level: "recommended", sourceBase: source.operation },
      { key: "emergency_procedures", name: "Procedimentos de emergencia", level: "recommended", sourceBase: source.pcmsopgr },
      { key: "system_operation", name: "Operacao de sistema", level: "recommended", sourceBase: source.operation },
      { key: "conflict_conduct", name: "Conduta em conflito", level: "recommended", sourceBase: source.operation }
    ],
    occupationalHealthRequirements: clinicalExamSet,
    uniformRequirements: [standardUniformRequirement],
    epiRequirements: [],
    onboardingRequirements: [
      ...commonOnboarding,
      { key: "reception_procedures", name: "Procedimentos de recepcao", level: "recommended", sourceBase: source.operation },
      { key: "lgpd_acknowledgement", name: "Ciencia LGPD/sigilo", level: "recommended", sourceBase: source.operation }
    ],
    alertRules: [
      ...commonAlerts,
      { key: "guest_service_training_due", name: "Alerta de treinamento de atendimento", level: "recommended", alertBeforeDays: 30, targetRequirementKey: "guest_service", sourceBase: source.operation },
      { key: "lgpd_training_due", name: "Alerta de LGPD/sigilo", level: "recommended", alertBeforeDays: 30, targetRequirementKey: "lgpd_confidentiality", sourceBase: source.operation }
    ]
  },
  {
    ruleGroup: "kitchen_food_beverage",
    sector: "Cozinha / A&B",
    jobTitles: ["Atendente de Restaurante", "Auxiliar de Cozinha", "Auxiliar nos Servicos de Alimentacao", "Cozinheira Geral", "Cozinheiro Geral", "Lider de Cozinha"],
    cboCodes: ["513435", "513505", "513205", "confirmar"],
    departmentHints: ["cozinha", "a&b", "alimentos", "bebidas", "restaurante"],
    riskTags: ["heat", "noise", "standing_work", "cuts", "burns", "food_handling"],
    riskDescription: "Riscos de calor, ruido, postura em pe, cortes, ferimentos e queimaduras em rotinas de alimentacao.",
    sourceBase: source.pcmsopgr,
    documentRequirements: [...commonDocuments, { key: "epi_delivery_record", name: "Ficha de entrega de EPI", level: "required", sourceBase: source.pcmsopgr }],
    trainingRequirements: [
      integrationTraining,
      nr06Training,
      { key: "food_handling_good_practices", name: "Boas praticas de manipulacao de alimentos", level: "required", condition: "handles_food", alertBeforeDays: 30, sourceBase: source.pcmsopgr },
      { key: "food_hygiene", name: "Higiene alimentar", level: "required", condition: "handles_food", alertBeforeDays: 30, sourceBase: source.pcmsopgr },
      { key: "cuts_burns_prevention", name: "Prevencao de cortes e queimaduras", level: "recommended", alertBeforeDays: 30, sourceBase: source.pcmsopgr },
      ergonomicsTraining,
      { key: "heat_hydration", name: "Calor e hidratacao", level: "recommended", condition: "works_with_heat", sourceBase: source.pcmsopgr }
    ],
    occupationalHealthRequirements: [
      ...clinicalExamSet,
      { key: "hemogram", name: "Hemograma", level: "required", condition: "handles_food", sourceBase: ["PCMSO", "MATRIZ_RH_30B"] },
      { key: "coproculture", name: "Coprocultura", level: "required", condition: "handles_food", sourceBase: ["PCMSO", "MATRIZ_RH_30B"] },
      { key: "parasitological_stool_exam", name: "Parasitologico de fezes", level: "required", condition: "handles_food", sourceBase: ["PCMSO", "MATRIZ_RH_30B"] }
    ],
    uniformRequirements: [standardUniformRequirement],
    epiRequirements: [
      { key: "thermal_glove", name: "Luva termica", level: "conditional", condition: "works_with_heat", sourceBase: source.pcmsopgr },
      { key: "cut_resistant_glove", name: "Luva anticorte", level: "conditional", condition: "uses_cutting_tools", sourceBase: source.pcmsopgr },
      { key: "adequate_footwear", name: "Calcado adequado", level: "required", sourceBase: source.pcmsopgr }
    ],
    onboardingRequirements: [
      ...commonOnboarding,
      { key: "sector_procedures_food", name: "Procedimentos de cozinha/A&B", level: "recommended", sourceBase: source.operation },
      { key: "epi_awareness", name: "Ciencia de EPI", level: "required", sourceBase: source.pcmsopgr }
    ],
    alertRules: [
      ...commonAlerts,
      { key: "complementary_exams_due", name: "Alerta de exames complementares", level: "required", alertBeforeDays: 15, targetRequirementKey: "hemogram", sourceBase: ["PCMSO", "MATRIZ_RH_30B"] },
      { key: "food_practices_training_due", name: "Alerta de boas praticas alimentares", level: "required", alertBeforeDays: 30, targetRequirementKey: "food_handling_good_practices", sourceBase: source.pcmsopgr },
      { key: "epi_training_due", name: "Alerta de treinamento EPI", level: "required", alertBeforeDays: 30, targetRequirementKey: "nr06_epi", sourceBase: source.pcmsopgr },
      { key: "epi_delivery_pending", name: "Alerta de entrega de EPI", level: "required", alertBeforeDays: 7, targetRequirementKey: "epi_delivery_record", sourceBase: source.pcmsopgr }
    ]
  },
  {
    ruleGroup: "housekeeping_general_services",
    sector: "Governanca / Camareiras / Servicos Gerais",
    jobTitles: ["Camareira", "Camareira Area Comum", "Lider de Camareira", "Auxiliar de Servicos Gerais", "Governanta de Hotelaria", "Supervisor de Hotelaria", "Supervisora de Hotelaria"],
    cboCodes: ["513315", "514320", "513115", "confirmar"],
    departmentHints: ["governanca", "camareira", "servicos gerais", "hotelaria", "limpeza"],
    riskTags: ["cleaning_products", "biological_agents", "standing_work", "stairs", "same_level_fall"],
    riskDescription: "Riscos por produtos domissanitarios, agentes biologicos, postura em pe/andando/subindo escadas e queda do mesmo nivel.",
    sourceBase: source.pcmsopgr,
    documentRequirements: [...commonDocuments, { key: "epi_delivery_record", name: "Ficha de entrega de EPI", level: "required", sourceBase: source.pcmsopgr }],
    trainingRequirements: [
      integrationTraining,
      nr06Training,
      { key: "cleaning_products_safe_use", name: "Uso seguro de produtos de limpeza", level: "required", condition: "uses_chemical_products", alertBeforeDays: 30, sourceBase: source.pcmsopgr },
      ergonomicsTraining,
      { key: "fall_prevention", name: "Prevencao de quedas", level: "recommended", alertBeforeDays: 30, sourceBase: source.pcmsopgr },
      { key: "housekeeping_procedures", name: "Procedimentos de limpeza/governanca", level: "recommended", sourceBase: source.operation }
    ],
    occupationalHealthRequirements: [
      ...clinicalExamSet
    ],
    uniformRequirements: [standardUniformRequirement],
    epiRequirements: [
      { key: "cleaning_gloves", name: "Luvas para limpeza/produtos", level: "required", condition: "uses_chemical_products", sourceBase: source.pcmsopgr },
      { key: "adequate_footwear", name: "Calcado adequado", level: "required", sourceBase: source.pcmsopgr },
      { key: "mask_or_goggles", name: "Mascara/oculos conforme produto", level: "conditional", condition: "uses_chemical_products", sourceBase: source.pcmsopgr },
      { key: "apron", name: "Avental", level: "conditional", sourceBase: source.pcmsopgr, notes: "Aplicar conforme produto, atividade e orientacao SST." }
    ],
    onboardingRequirements: [
      ...commonOnboarding,
      { key: "sector_procedures_housekeeping", name: "Procedimentos de governanca/limpeza", level: "recommended", sourceBase: source.operation },
      { key: "epi_awareness", name: "Ciencia de EPI", level: "required", sourceBase: source.pcmsopgr }
    ],
    alertRules: [
      ...commonAlerts,
      { key: "epi_delivery_pending", name: "Alerta de entrega de EPI", level: "required", alertBeforeDays: 7, targetRequirementKey: "epi_delivery_record", sourceBase: source.pcmsopgr },
      { key: "cleaning_products_training_due", name: "Alerta de treinamento de produtos de limpeza", level: "required", alertBeforeDays: 30, targetRequirementKey: "cleaning_products_safe_use", sourceBase: source.pcmsopgr },
      { key: "housekeeping_training_due", name: "Alerta de treinamento de governanca", level: "recommended", alertBeforeDays: 30, targetRequirementKey: "housekeeping_procedures", sourceBase: source.operation }
    ]
  },
  {
    ruleGroup: "laundry",
    sector: "Lavanderia",
    jobTitles: ["Auxiliar de Lavanderia"],
    cboCodes: ["confirmar"],
    departmentHints: ["lavanderia"],
    riskTags: ["heat", "noise", "same_level_fall", "ergonomic", "linen_handling"],
    riskDescription: "Riscos de calor, ruido, queda do mesmo nivel e ergonomia no manuseio de roupas.",
    sourceBase: source.pcmsopgr,
    documentRequirements: [...commonDocuments, { key: "epi_delivery_record", name: "Ficha de entrega de EPI", level: "required", sourceBase: source.pcmsopgr }],
    trainingRequirements: [
      integrationTraining,
      nr06Training,
      { key: "laundry_safe_operation", name: "Operacao segura de lavanderia", level: "recommended", alertBeforeDays: 30, sourceBase: source.pcmsopgr },
      { key: "fall_prevention", name: "Prevencao de quedas", level: "recommended", sourceBase: source.pcmsopgr },
      { key: "ergonomics_movement", name: "Ergonomia e movimentacao de roupas", level: "recommended", sourceBase: source.pcmsopgr }
    ],
    occupationalHealthRequirements: clinicalExamSet,
    uniformRequirements: [standardUniformRequirement],
    epiRequirements: [
      { key: "adequate_footwear", name: "Calcado adequado", level: "required", sourceBase: source.pcmsopgr },
      { key: "gloves_when_applicable", name: "Luvas quando aplicavel", level: "conditional", sourceBase: source.pcmsopgr },
      { key: "hearing_protection", name: "Protetor auditivo", level: "confirm_with_sst", condition: "works_in_laundry_noise", sourceBase: source.pcmsopgr, notes: "Confirmar exposicao e necessidade com SST." }
    ],
    onboardingRequirements: [
      ...commonOnboarding,
      { key: "sector_procedures_laundry", name: "Procedimentos de lavanderia", level: "recommended", sourceBase: source.operation },
      { key: "epi_awareness", name: "Ciencia de EPI", level: "required", sourceBase: source.pcmsopgr }
    ],
    alertRules: [
      ...commonAlerts,
      { key: "epi_training_due", name: "Alerta de treinamento EPI", level: "required", alertBeforeDays: 30, targetRequirementKey: "nr06_epi", sourceBase: source.pcmsopgr },
      { key: "laundry_training_due", name: "Alerta de operacao segura de lavanderia", level: "recommended", alertBeforeDays: 30, targetRequirementKey: "laundry_safe_operation", sourceBase: source.pcmsopgr },
      { key: "hearing_protection_sst_review", name: "Alerta de confirmacao SST para protetor auditivo", level: "confirm_with_sst", alertBeforeDays: 7, targetRequirementKey: "hearing_protection", sourceBase: source.pcmsopgr }
    ]
  },
  {
    ruleGroup: "maintenance",
    sector: "Manutencao Predial",
    jobTitles: ["Auxiliar de Manutencao Predial", "Encarregado de Manutencao"],
    cboCodes: ["514310", "950110"],
    departmentHints: ["manutencao", "predial"],
    riskTags: ["chemical_products", "cuts", "falls", "postural", "electric_shock", "height_work"],
    riskDescription: "Riscos por produtos quimicos, cortes, queda, postura, choque eletrico e possivel trabalho em altura conforme atividade real.",
    sourceBase: source.reports,
    documentRequirements: [...commonDocuments, { key: "epi_delivery_record", name: "Ficha de entrega de EPI", level: "required", sourceBase: source.pcmsopgr }],
    trainingRequirements: [
      integrationTraining,
      nr06Training,
      { key: "nr10_electrical_safety", name: "NR-10", level: "conditional", condition: "performs_electrical_work", validityDays: 730, alertBeforeDays: 60, sourceBase: source.pcmsopgr },
      { key: "height_work", name: "Trabalho em altura", level: "conditional", condition: "works_above_2m", validityDays: 730, alertBeforeDays: 60, sourceBase: source.pcmsopgr },
      { key: "chemical_products_fispq", name: "Produtos quimicos / FISPQ", level: "conditional", condition: "uses_chemical_products", sourceBase: source.pcmsopgr },
      { key: "manual_tools", name: "Ferramentas manuais", level: "recommended", sourceBase: source.pcmsopgr },
      { key: "fall_prevention", name: "Prevencao de quedas", level: "recommended", sourceBase: source.pcmsopgr }
    ],
    occupationalHealthRequirements: [
      ...clinicalExamSet,
      { key: "visual_acuity", name: "Acuidade visual", level: "required", sourceBase: ["PCMSO", "MATRIZ_RH_30B"] },
      { key: "audiometry", name: "Audiometria", level: "required", sourceBase: ["PCMSO", "MATRIZ_RH_30B"] },
      { key: "ecg", name: "Eletrocardiograma", level: "required", sourceBase: ["PCMSO", "MATRIZ_RH_30B"] },
      { key: "eeg", name: "Eletroencefalograma", level: "required", sourceBase: ["PCMSO", "MATRIZ_RH_30B"] },
      { key: "gamma_gt", name: "Gama GT", level: "required", sourceBase: ["PCMSO", "MATRIZ_RH_30B"] },
      { key: "fasting_glucose", name: "Glicemia de jejum", level: "required", sourceBase: ["PCMSO", "MATRIZ_RH_30B"] },
      { key: "hemogram", name: "Hemograma completo", level: "required", sourceBase: ["PCMSO", "MATRIZ_RH_30B"] }
    ],
    uniformRequirements: [standardUniformRequirement],
    epiRequirements: [
      { key: "mechanical_gloves", name: "Luva mecanica", level: "required", sourceBase: source.pcmsopgr },
      { key: "chemical_gloves", name: "Luva quimica", level: "conditional", condition: "uses_chemical_products", sourceBase: source.pcmsopgr },
      { key: "safety_goggles", name: "Oculos de protecao", level: "required", sourceBase: source.pcmsopgr },
      { key: "pff2_mask", name: "PFF2", level: "conditional", condition: "uses_chemical_products", sourceBase: source.pcmsopgr },
      { key: "electrical_ppe", name: "EPIs eletricos", level: "conditional", condition: "performs_electrical_work", sourceBase: source.pcmsopgr }
    ],
    onboardingRequirements: [
      ...commonOnboarding,
      { key: "sector_procedures_maintenance", name: "Procedimentos de manutencao", level: "recommended", sourceBase: source.operation },
      { key: "epi_awareness", name: "Ciencia de EPI", level: "required", sourceBase: source.pcmsopgr },
      { key: "conditional_activity_review", name: "Revisao de atividades condicionais", level: "required", sourceBase: source.pcmsopgr, notes: "Confirmar eletrica, altura e produtos quimicos antes de gerar obrigacoes especificas." }
    ],
    alertRules: [
      ...commonAlerts,
      { key: "complementary_exams_due", name: "Alerta de exames complementares", level: "required", alertBeforeDays: 15, targetRequirementKey: "visual_acuity", sourceBase: ["PCMSO", "MATRIZ_RH_30B"] },
      { key: "nr10_review_due", name: "Alerta NR-10 se aplicavel", level: "conditional", condition: "performs_electrical_work", alertBeforeDays: 60, targetRequirementKey: "nr10_electrical_safety", sourceBase: source.pcmsopgr },
      { key: "height_work_review_due", name: "Alerta trabalho em altura se aplicavel", level: "conditional", condition: "works_above_2m", alertBeforeDays: 60, targetRequirementKey: "height_work", sourceBase: source.pcmsopgr },
      { key: "epi_delivery_pending", name: "Alerta de entrega de EPI", level: "required", alertBeforeDays: 7, targetRequirementKey: "epi_delivery_record", sourceBase: source.pcmsopgr }
    ]
  },
  {
    ruleGroup: "security",
    sector: "Seguranca",
    jobTitles: ["Seguranca", "Vigilante"],
    cboCodes: ["517330", "confirmar"],
    departmentHints: ["seguranca", "vigilancia"],
    riskTags: ["standing_work", "walking", "stairs", "same_level_fall", "incident_response"],
    riskDescription: "Riscos por postura em pe, deslocamento, escadas, queda e atendimento a incidentes.",
    sourceBase: source.reports,
    documentRequirements: [
      ...commonDocuments,
      { key: "security_periculosidade_review", name: "Revisao de periculosidade", level: "confirm_with_sst", condition: "security_periculosidade_review", sourceBase: ["LAUDO_PERICULOSIDADE", "MATRIZ_RH_30B"], notes: "Folha indicou periculosidade para vigilante, mas laudo aponta ausencia. Confirmar com SST/trabalhista." }
    ],
    trainingRequirements: [
      integrationTraining,
      { key: "access_control", name: "Controle de acesso", level: "recommended", sourceBase: source.operation },
      { key: "emergency_procedures", name: "Procedimentos de emergencia", level: "recommended", sourceBase: source.pcmsopgr },
      { key: "incident_records", name: "Registro de ocorrencias", level: "recommended", sourceBase: source.operation },
      { key: "first_aid", name: "Primeiros socorros", level: "recommended", sourceBase: source.operation },
      { key: "fall_prevention_ergonomics", name: "Prevencao de quedas e ergonomia", level: "recommended", sourceBase: source.pcmsopgr }
    ],
    occupationalHealthRequirements: clinicalExamSet,
    uniformRequirements: [standardUniformRequirement],
    epiRequirements: [
      { key: "security_items", name: "Itens de seguranca conforme contrato/atividade", level: "confirm_with_sst", sourceBase: source.operation }
    ],
    onboardingRequirements: [
      ...commonOnboarding,
      { key: "sector_procedures_security", name: "Procedimentos de seguranca", level: "recommended", sourceBase: source.operation },
      { key: "incident_response", name: "Conduta em incidentes", level: "recommended", sourceBase: source.operation }
    ],
    alertRules: [
      ...commonAlerts,
      { key: "emergency_training_due", name: "Alerta de procedimentos de emergencia", level: "recommended", alertBeforeDays: 30, targetRequirementKey: "emergency_procedures", sourceBase: source.pcmsopgr },
      { key: "security_periculosidade_sst_review", name: "Alerta de confirmacao SST/trabalhista para periculosidade", level: "confirm_with_sst", condition: "security_periculosidade_review", alertBeforeDays: 7, targetRequirementKey: "security_periculosidade_review", sourceBase: ["LAUDO_PERICULOSIDADE", "MATRIZ_RH_30B"] }
    ]
  }
] as const satisfies HrJobRequirementRule[];

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchesText(value: string | null | undefined, candidates: string[]) {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeText(candidate);
    return normalized === normalizedCandidate || normalized.includes(normalizedCandidate) || normalizedCandidate.includes(normalized);
  });
}

export function findJobRequirementRuleByGroup(ruleGroup: HrJobRequirementRuleGroup | null | undefined) {
  if (!ruleGroup) return null;
  return hrJobRequirementRules.find((rule) => rule.ruleGroup === ruleGroup) ?? null;
}

export function findJobRequirementRuleByCbo(cboCode: string | null | undefined) {
  const normalizedCbo = normalizeText(cboCode);
  if (!normalizedCbo || normalizedCbo === "confirmar") return null;
  return hrJobRequirementRules.find((rule) => rule.cboCodes.some((code) => normalizeText(code) === normalizedCbo)) ?? null;
}

export function findJobRequirementRuleByJobTitle(jobTitle: string | null | undefined) {
  return hrJobRequirementRules.find((rule) => matchesText(jobTitle, rule.jobTitles)) ?? null;
}

export function findJobRequirementRuleBySector(sector: string | null | undefined) {
  return hrJobRequirementRules.find((rule) => matchesText(sector, [rule.sector, ...rule.departmentHints])) ?? null;
}

export function findJobRequirementRule(input: FindJobRequirementRuleInput) {
  return (
    findJobRequirementRuleByGroup(input.ruleGroup) ??
    findJobRequirementRuleByCbo(input.cboCode) ??
    findJobRequirementRuleByJobTitle(input.jobTitle) ??
    findJobRequirementRuleBySector(input.sector) ??
    findJobRequirementRuleBySector(input.department) ??
    null
  );
}

export function listJobRequirementRulesByLevel(level: HrJobRequirementLevel) {
  return hrJobRequirementRules.map((rule) => ({
    ruleGroup: rule.ruleGroup,
    sector: rule.sector,
    requirements: [
      ...rule.documentRequirements,
      ...rule.trainingRequirements,
      ...rule.occupationalHealthRequirements,
      ...rule.uniformRequirements,
      ...rule.epiRequirements,
      ...rule.onboardingRequirements,
      ...rule.alertRules
    ].filter((requirement) => requirement.level === level)
  }));
}
