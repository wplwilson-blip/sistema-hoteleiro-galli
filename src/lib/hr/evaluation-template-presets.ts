export type EvaluationTemplatePresetCriterion = {
  code: string;
  title: string;
  description?: string;
  weight?: number;
  isCritical?: boolean;
  requiresCommentBelowScore?: boolean;
  commentRequiredScoreThreshold?: number;
};

export type EvaluationTemplatePresetSection = {
  code: string;
  title: string;
  description?: string;
  weight?: number;
  criteria: EvaluationTemplatePresetCriterion[];
};

export type EvaluationTemplatePreset = {
  code: string;
  name: string;
  description: string;
  evaluationType: "experience" | "periodic";
  defaultFrequency: "experience_90_days" | "semiannual" | "annual" | "on_demand";
  passingScore: number;
  sections: EvaluationTemplatePresetSection[];
};

const commentThreshold = 3;

function criterion(code: string, title: string, options: Partial<EvaluationTemplatePresetCriterion> = {}): EvaluationTemplatePresetCriterion {
  const isCritical = Boolean(options.isCritical);

  return {
    code,
    title,
    weight: isCritical ? 2 : 1,
    requiresCommentBelowScore: isCritical,
    commentRequiredScoreThreshold: isCritical ? commentThreshold : undefined,
    ...options
  };
}

export const hotelGalliEvaluationTemplatePresets: EvaluationTemplatePreset[] = [
  {
    code: "HG_EXP_30",
    name: "Avaliacao de Experiencia - 30 dias",
    description: "Acompanha adaptacao inicial, presenca, postura, aprendizagem e abertura a orientacoes nas primeiras semanas.",
    evaluationType: "experience",
    defaultFrequency: "on_demand",
    passingScore: 3.5,
    sections: [
      {
        code: "PRESENCA_POSTURA",
        title: "Presenca e Postura",
        criteria: [
          criterion("PONTUALIDADE", "Chega no horario combinado", { isCritical: true }),
          criterion("ASSIDUIDADE", "Mantem presenca regular no periodo", { isCritical: true }),
          criterion("APRESENTACAO", "Mantem apresentacao pessoal adequada ao setor"),
          criterion("CONDUTA", "Respeita normas internas e orientacoes da lideranca", { isCritical: true })
        ]
      },
      {
        code: "APRENDIZAGEM",
        title: "Aprendizagem da Funcao",
        criteria: [
          criterion("ROTINAS_BASICAS", "Entende as rotinas basicas da funcao", { isCritical: true }),
          criterion("SEGUE_ORIENTACOES", "Segue orientacoes sem resistencia"),
          criterion("INTERESSE", "Demonstra interesse em aprender"),
          criterion("EVOLUCAO", "Apresenta evolucao desde a admissao")
        ]
      },
      {
        code: "ADAPTACAO",
        title: "Adaptacao ao Hotel",
        criteria: [
          criterion("EQUIPE", "Relaciona-se bem com colegas"),
          criterion("COMUNICACAO", "Comunica duvidas e dificuldades no momento certo"),
          criterion("PADRAO_HOTEL", "Demonstra cuidado com o padrao do hotel", { isCritical: true })
        ]
      }
    ]
  },
  {
    code: "HG_EXP_60",
    name: "Avaliacao de Experiencia - 60 dias",
    description: "Avalia consolidacao das rotinas, reducao de erros, responsabilidade e resposta aos feedbacks.",
    evaluationType: "experience",
    defaultFrequency: "on_demand",
    passingScore: 3.5,
    sections: [
      {
        code: "EXECUCAO_ROTINAS",
        title: "Execucao das Rotinas",
        criteria: [
          criterion("CUMPRE_ROTINAS", "Cumpre as rotinas combinadas", { isCritical: true }),
          criterion("QUALIDADE_ENTREGA", "Entrega o trabalho com qualidade", { isCritical: true }),
          criterion("ORGANIZACAO", "Mantem organizacao durante o turno"),
          criterion("REDUCAO_ERROS", "Reduz erros recorrentes")
        ]
      },
      {
        code: "RESPONSABILIDADE",
        title: "Responsabilidade",
        criteria: [
          criterion("PONTUALIDADE", "Mantem pontualidade e presenca", { isCritical: true }),
          criterion("CUIDADO_EQUIPAMENTOS", "Cuida de equipamentos, materiais e areas de trabalho"),
          criterion("COMUNICACAO_OCORRENCIAS", "Comunica ocorrencias e dificuldades", { isCritical: true })
        ]
      },
      {
        code: "FEEDBACK",
        title: "Feedback e Evolucao",
        criteria: [
          criterion("ACEITA_FEEDBACK", "Aceita feedbacks e aplica correcoes"),
          criterion("PROATIVIDADE", "Age com iniciativa dentro do que ja foi treinado"),
          criterion("EQUIPE", "Colabora com a equipe no turno")
        ]
      }
    ]
  },
  {
    code: "HG_EXP_90",
    name: "Avaliacao de Experiencia - 90 dias",
    description: "Apoia a decisao humana sobre conclusao da experiencia, permanencia e plano de acompanhamento.",
    evaluationType: "experience",
    defaultFrequency: "experience_90_days",
    passingScore: 3.5,
    sections: [
      {
        code: "DESEMPENHO",
        title: "Desempenho da Funcao",
        criteria: [
          criterion("DOMINIO_ROTINAS", "Domina as rotinas essenciais da funcao", { isCritical: true }),
          criterion("QUALIDADE_CONSTANTE", "Mantem qualidade constante", { isCritical: true }),
          criterion("AUTONOMIA", "Trabalha com autonomia adequada ao cargo"),
          criterion("CONFIABILIDADE", "E confiavel na execucao e nos combinados", { isCritical: true })
        ]
      },
      {
        code: "CONDUTA",
        title: "Conduta e Equipe",
        criteria: [
          criterion("POSTURA", "Mantem postura profissional"),
          criterion("RESPEITO_LIDERANCA", "Respeita lideranca e combinados", { isCritical: true }),
          criterion("TRABALHO_EQUIPE", "Trabalha bem em equipe"),
          criterion("COMUNICACAO", "Comunica informacoes relevantes com clareza")
        ]
      },
      {
        code: "CONCLUSAO",
        title: "Conclusao da Experiencia",
        criteria: [
          criterion("ADERENCIA_FUNCAO", "Demonstra aderencia a funcao", { isCritical: true, weight: 3 }),
          criterion("ADERENCIA_HOTEL", "Demonstra aderencia a cultura e ao padrao do hotel", { isCritical: true, weight: 3 }),
          criterion("ACOMPANHAMENTO", "Necessita acompanhamento adicional apos a experiencia", { isCritical: true })
        ]
      }
    ]
  },
  {
    code: "HG_PERIODICA_GERAL",
    name: "Avaliacao Periodica Geral",
    description: "Modelo enxuto para todos os setores, com criterios universais de qualidade, postura, atitude e comunicacao.",
    evaluationType: "periodic",
    defaultFrequency: "semiannual",
    passingScore: 3.5,
    sections: [
      {
        code: "QUALIDADE",
        title: "Qualidade e Tecnica",
        criteria: [
          criterion("QUALIDADE_TECNICA", "Executa as tarefas com precisao e padrao", { isCritical: true }),
          criterion("CUMPRE_PADROES", "Segue processos, POPs e padroes definidos", { isCritical: true }),
          criterion("ATENCAO_DETALHE", "Percebe detalhes antes que virem problema"),
          criterion("PRODUTIVIDADE", "Cumpre o volume de trabalho esperado")
        ]
      },
      {
        code: "POSTURA",
        title: "Postura Profissional",
        criteria: [
          criterion("APRESENTACAO", "Mantem uniforme, higiene e apresentacao adequados"),
          criterion("PONTUALIDADE", "Cumpre horarios e mantem presenca regular", { isCritical: true }),
          criterion("HOSPEDE", "Trata o hospede com cordialidade e discricao", { isCritical: true }),
          criterion("EQUIPE", "Mantem relacionamento respeitoso com a equipe")
        ]
      },
      {
        code: "ATITUDE",
        title: "Atitude e Comunicacao",
        criteria: [
          criterion("COMPROMETIMENTO", "Demonstra responsabilidade com o setor"),
          criterion("FEEDBACK", "Recebe feedbacks e aplica orientacoes"),
          criterion("COMUNICACAO_LIDERANCA", "Comunica ocorrencias e duvidas no momento certo", { isCritical: true }),
          criterion("REGISTROS", "Preenche registros e controles da area corretamente", { isCritical: true })
        ]
      }
    ]
  },
  {
    code: "HG_CAMAREIRA",
    name: "Avaliacao de Camareira",
    description: "Modelo operacional para limpeza, banheiro, cama, rouparia, organizacao do turno, postura e EPIs.",
    evaluationType: "periodic",
    defaultFrequency: "semiannual",
    passingScore: 3.5,
    sections: [
      {
        code: "LIMPEZA_TECNICA",
        title: "Limpeza Tecnica",
        criteria: [
          criterion("SEQUENCIA_LIMPEZA", "Segue a sequencia correta de limpeza da UH", { isCritical: true }),
          criterion("PRODUTOS_CORRETOS", "Usa produtos corretos para cada superficie", { isCritical: true, weight: 3 }),
          criterion("NAO_MISTURA_PRODUTOS", "Nunca mistura produtos quimicos", { isCritical: true, weight: 3 }),
          criterion("CANTOS_DETALHES", "Limpa cantos, rodapes, grades e areas atras dos equipamentos", { isCritical: true })
        ]
      },
      {
        code: "BANHEIRO",
        title: "Banheiro",
        criteria: [
          criterion("DESINFECCAO", "Aplica produtos e aguarda o tempo de acao", { isCritical: true }),
          criterion("ESPELHO", "Entrega espelho sem manchas ou marcas"),
          criterion("VASO", "Limpa vaso por dentro, por fora, assento e base", { isCritical: true, weight: 3 }),
          criterion("RALOS_CABELOS", "Remove cabelos e deixa ralos limpos", { isCritical: true, weight: 3 }),
          criterion("REPOSICAO", "Repoe itens de banheiro conforme padrao", { isCritical: true })
        ]
      },
      {
        code: "CAMA_ROUPARIA",
        title: "Cama e Rouparia",
        criteria: [
          criterion("LENCOL", "Deixa lencol esticado e preso corretamente", { isCritical: true }),
          criterion("TRAVESSEIROS", "Centraliza travesseiros e fronhas sem marcas"),
          criterion("COLCHA", "Mantem colcha alinhada e sem rugas"),
          criterion("SEM_CABELO_MANCHA", "Entrega rouparia sem fio de cabelo ou mancha", { isCritical: true, weight: 3 })
        ]
      },
      {
        code: "ORGANIZACAO_POSTURA",
        title: "Organizacao e Postura",
        criteria: [
          criterion("CARRINHO", "Monta e organiza o carrinho antes do turno"),
          criterion("VISTORIA", "Faz vistoria antes de comunicar a UH como pronta", { isCritical: true, weight: 3 }),
          criterion("FOLHA_PLANTAO", "Preenche folha de plantao ao longo do turno", { isCritical: true }),
          criterion("EPIS", "Usa EPIs obrigatorios durante a execucao", { isCritical: true, weight: 3 }),
          criterion("ACHADOS_DANOS", "Aciona lideranca ao encontrar pertence, dano ou situacao irregular", { isCritical: true, weight: 3 })
        ]
      }
    ]
  },
  {
    code: "HG_GOVERNANTA",
    name: "Avaliacao de Governanta",
    description: "Modelo para lideranca de governanca, inspecao de UHs, equipe, controles, comunicacao e conduta.",
    evaluationType: "periodic",
    defaultFrequency: "semiannual",
    passingScore: 3.5,
    sections: [
      {
        code: "EXECUCAO_OPERACIONAL",
        title: "Execucao Operacional",
        criteria: [
          criterion("DISTRIBUICAO", "Distribui corretamente a listagem de apartamentos"),
          criterion("INSPECAO", "Realiza inspecao completa antes de liberar cada UH", { isCritical: true, weight: 3 }),
          criterion("PRAZOS", "Acompanha prazos de liberacao dos apartamentos", { isCritical: true }),
          criterion("PROTOCOLO", "Segue protocolo de inspecao conforme POP", { isCritical: true }),
          criterion("MANUTENCAO", "Registra e acompanha solicitacoes de manutencao", { isCritical: true })
        ]
      },
      {
        code: "GESTAO_EQUIPE",
        title: "Gestao de Equipe",
        criteria: [
          criterion("ORIENTA_EQUIPE", "Orienta a equipe claramente no inicio do turno"),
          criterion("REDISTRIBUI", "Redistribui tarefas diante de ausencia ou imprevisto"),
          criterion("FEEDBACK", "Da feedback direto e construtivo quando ha desvio", { isCritical: true }),
          criterion("PRODUTIVIDADE", "Mantem a equipe focada, organizada e produtiva")
        ]
      },
      {
        code: "CONTROLES",
        title: "Controles e Registros",
        criteria: [
          criterion("ENXOVAL", "Mantem controle de enxoval atualizado", { isCritical: true }),
          criterion("ACHADOS", "Registra achados e perdidos com dados completos", { isCritical: true, weight: 3 }),
          criterion("RELATORIOS", "Entrega relatorios e controles nos prazos combinados"),
          criterion("COMPRAS", "Organiza lista de necessidades com quantidade e urgencia")
        ]
      },
      {
        code: "COMUNICACAO_CONDUTA",
        title: "Comunicacao e Conduta",
        criteria: [
          criterion("RECEPCAO", "Comunica a recepcao sobre bloqueios e liberacoes", { isCritical: true }),
          criterion("PRIORIDADE", "Define prioridade ao acionar manutencao"),
          criterion("OCORRENCIAS", "Informa ocorrencias relevantes no mesmo turno", { isCritical: true }),
          criterion("SIGILO", "Preserva sigilo de dados de hospedes e colaboradores", { isCritical: true, weight: 3 })
        ]
      }
    ]
  },
  {
    code: "HG_RECEPCAO",
    name: "Avaliacao de Recepcao",
    description: "Modelo operacional para atendimento, organizacao, registros, passagem de turno, comunicacao e sigilo.",
    evaluationType: "periodic",
    defaultFrequency: "semiannual",
    passingScore: 3.5,
    sections: [
      {
        code: "ATENDIMENTO",
        title: "Atendimento e Postura",
        criteria: [
          criterion("CUMPRIMENTO", "Cumprimenta o hospede com cordialidade", { isCritical: true }),
          criterion("TOM_VOZ", "Usa tom de voz claro e adequado ao ambiente"),
          criterion("INFORMACOES", "Passa informacoes com clareza e seguranca", { isCritical: true }),
          criterion("RECLAMACOES", "Encaminha reclamacoes com calma e foco em solucao", { isCritical: true, weight: 3 })
        ]
      },
      {
        code: "ORGANIZACAO",
        title: "Organizacao da Recepcao",
        criteria: [
          criterion("BALCAO", "Mantem balcao limpo e sem objetos pessoais"),
          criterion("EQUIPAMENTOS", "Mantem equipamentos organizados e em bom estado"),
          criterion("CHAVES", "Mantem chaves e materiais no lugar correto", { isCritical: true }),
          criterion("DOCUMENTOS", "Organiza documentos e comprovantes do turno", { isCritical: true })
        ]
      },
      {
        code: "ROTINA_TURNO",
        title: "Rotina de Turno",
        criteria: [
          criterion("CHECKLIST_ABERTURA", "Preenche checklist de abertura sem omissoes", { isCritical: true }),
          criterion("CHECKLIST_ENCERRAMENTO", "Preenche checklist de encerramento no horario", { isCritical: true }),
          criterion("PASSAGEM_TURNO", "Realiza passagem de turno clara e documentada", { isCritical: true, weight: 3 }),
          criterion("REGISTROS", "Registra ocorrencias importantes no local correto", { isCritical: true })
        ]
      },
      {
        code: "COMUNICACAO_SIGILO",
        title: "Comunicacao e Sigilo",
        criteria: [
          criterion("GOVERNANCA", "Comunica a governanca quando ha liberacao ou pendencia", { isCritical: true }),
          criterion("MANUTENCAO", "Abre solicitacoes internas quando identifica necessidade", { isCritical: true }),
          criterion("SETORES", "Encaminha demandas aos setores corretos sem acumular"),
          criterion("SIGILO", "Nunca fornece dados pessoais a terceiros", { isCritical: true, weight: 3 })
        ]
      }
    ]
  },
  {
    code: "HG_AB_CAFE",
    name: "Avaliacao de A&B - Cafe da Manha",
    description: "Modelo para cafe da manha, higiene alimentar, buffet, producao, atendimento, comunicacao e lideranca quando aplicavel.",
    evaluationType: "periodic",
    defaultFrequency: "semiannual",
    passingScore: 3.5,
    sections: [
      {
        code: "POSTURA",
        title: "Postura e Conduta",
        criteria: [
          criterion("PONTUALIDADE", "Chega no horario e avisa ausencias com antecedencia", { isCritical: true }),
          criterion("APRESENTACAO", "Usa uniforme limpo e dentro do padrao"),
          criterion("CELULAR", "Mantem postura adequada, sem celular durante o servico", { isCritical: true }),
          criterion("HOSPEDE", "Atende hospedes com cordialidade e presteza", { isCritical: true })
        ]
      },
      {
        code: "HIGIENE",
        title: "Higiene e Seguranca Alimentar",
        criteria: [
          criterion("MAOS", "Realiza higiene correta e frequente das maos", { isCritical: true, weight: 3 }),
          criterion("EPI", "Usa touca, avental e calcado fechado na manipulacao", { isCritical: true, weight: 3 }),
          criterion("EQUIPAMENTOS", "Higieniza equipamentos e utensilios corretamente", { isCritical: true }),
          criterion("TEMPERATURA", "Mantem alimentos nas temperaturas corretas", { isCritical: true, weight: 3 }),
          criterion("PVPS", "Aplica identificacao e PVPS nos alimentos", { isCritical: true, weight: 3 }),
          criterion("DESCARTE", "Descarta alimentos vencidos ou fora do padrao sem hesitar", { isCritical: true, weight: 3 })
        ]
      },
      {
        code: "ROTINAS",
        title: "Rotinas e Buffet",
        criteria: [
          criterion("ABERTURA", "Buffet pronto e aberto no horario combinado", { isCritical: true }),
          criterion("RONDAS", "Realiza rondas e registros nos horarios corretos", { isCritical: true }),
          criterion("REPOSICAO", "Faz reposicao antecipada sem deixar item zerar", { isCritical: true, weight: 3 }),
          criterion("ENCERRAMENTO", "Executa encerramento, armazenamento e limpeza no prazo", { isCritical: true }),
          criterion("CHECKLISTS", "Preenche checklists sem lacunas ou retroatividade", { isCritical: true })
        ]
      },
      {
        code: "PRODUCAO_COMUNICACAO",
        title: "Producao e Comunicacao",
        criteria: [
          criterion("PRODUCAO", "Segue a escala de producao sem improvisos"),
          criterion("QUALIDADE_ALIMENTOS", "Mantem qualidade visual e ponto das preparacoes", { isCritical: true }),
          criterion("DESPERDICIO", "Evita desperdicio excessivo de insumos", { isCritical: true }),
          criterion("OCORRENCIAS", "Reporta ocorrencias no momento certo", { isCritical: true }),
          criterion("NECESSIDADES", "Lista necessidades com quantidade e urgencia")
        ]
      }
    ]
  },
  {
    code: "HG_AB_JANTAR",
    name: "Avaliacao de A&B - Jantar",
    description: "Modelo para jantar e salao, postura, higiene, rotina de servico, pedidos, comunicacao e conduta.",
    evaluationType: "periodic",
    defaultFrequency: "semiannual",
    passingScore: 3.5,
    sections: [
      {
        code: "POSTURA",
        title: "Postura e Apresentacao",
        criteria: [
          criterion("UNIFORME", "Usa uniforme completo, limpo e identificado"),
          criterion("DISPOSICAO", "Mantem postura ativa e disposicao no turno"),
          criterion("TOM_VOZ", "Usa tom de voz cordial e adequado"),
          criterion("CELULAR", "Nao usa celular pessoal durante atendimento", { isCritical: true })
        ]
      },
      {
        code: "HIGIENE_ORGANIZACAO",
        title: "Higiene e Organizacao",
        criteria: [
          criterion("ESTACAO", "Mantem bancada e estacao limpas", { isCritical: true }),
          criterion("UTENSILIOS", "Mantem utensilios e equipamentos organizados"),
          criterion("PREPARACAO", "Prepara o servico antes da abertura", { isCritical: true }),
          criterion("AMBIENTE", "Mantem salao ou cozinha limpos durante o servico", { isCritical: true })
        ]
      },
      {
        code: "SERVICO",
        title: "Servico ao Hospede",
        criteria: [
          criterion("ABORDAGEM", "Cumprimenta o hospede antes de ser chamado", { isCritical: true }),
          criterion("INFORMACOES", "Informa opcoes e indisponibilidades com clareza"),
          criterion("PEDIDO", "Registra pedido com clareza e confirma antes de enviar", { isCritical: true }),
          criterion("TEMPO", "Acompanha tempo de entrega e avisa atrasos", { isCritical: true }),
          criterion("RECLAMACAO", "Aplica procedimento correto em situacoes fora do padrao", { isCritical: true, weight: 3 })
        ]
      },
      {
        code: "COMUNICACAO_CONDUTA",
        title: "Comunicacao e Conduta",
        criteria: [
          criterion("COZINHA", "Comunica pedidos e ajustes com a cozinha sem ruídos", { isCritical: true }),
          criterion("OUTROS_SETORES", "Aciona setores corretos quando necessario"),
          criterion("COMANDAS", "Entrega registros do turno de forma organizada", { isCritical: true }),
          criterion("NORMAS", "Cumpre normas internas do ambiente de atendimento", { isCritical: true })
        ]
      }
    ]
  },
  {
    code: "HG_MANUTENCAO",
    name: "Avaliacao de Manutencao",
    description: "Modelo para chamados, qualidade tecnica, preventiva, seguranca, organizacao e comunicacao com setores.",
    evaluationType: "periodic",
    defaultFrequency: "semiannual",
    passingScore: 3.5,
    sections: [
      {
        code: "CHAMADOS",
        title: "Atendimento de Chamados",
        criteria: [
          criterion("RESPOSTA", "Atende chamados urgentes dentro do tempo esperado", { isCritical: true }),
          criterion("PRIORIZACAO", "Prioriza corretamente chamados que afetam hospedes", { isCritical: true }),
          criterion("REGISTRO", "Registra servico executado em todos os chamados", { isCritical: true }),
          criterion("COMUNICACAO_STATUS", "Informa status aos setores envolvidos", { isCritical: true })
        ]
      },
      {
        code: "QUALIDADE_TECNICA",
        title: "Qualidade Tecnica",
        criteria: [
          criterion("REPARO", "Resolve problemas com qualidade e sem retrabalho frequente", { isCritical: true, weight: 3 }),
          criterion("RECORRENCIA", "Busca prevenir recorrencia do mesmo problema", { isCritical: true }),
          criterion("PREVENTIVA", "Cumpre preventiva conforme plano do setor", { isCritical: true }),
          criterion("MATERIAIS", "Usa materiais e pecas de forma adequada")
        ]
      },
      {
        code: "SEGURANCA_ORGANIZACAO",
        title: "Seguranca e Organizacao",
        criteria: [
          criterion("SEGURANCA", "Executa atividades com seguranca", { isCritical: true, weight: 3 }),
          criterion("FERRAMENTAS", "Cuida de ferramentas e equipamentos"),
          criterion("AREA", "Deixa area limpa e segura apos o servico", { isCritical: true }),
          criterion("ESTOQUE", "Mantem pecas e materiais organizados")
        ]
      }
    ]
  },
  {
    code: "HG_ADMINISTRATIVO",
    name: "Avaliacao Administrativa",
    description: "Modelo para rotinas administrativas, organizacao, prazos, precisao, sigilo e comunicacao com setores.",
    evaluationType: "periodic",
    defaultFrequency: "semiannual",
    passingScore: 3.5,
    sections: [
      {
        code: "ORGANIZACAO",
        title: "Organizacao e Controle",
        criteria: [
          criterion("ARQUIVOS", "Mantem arquivos, planilhas e controles atualizados", { isCritical: true }),
          criterion("PENDENCIAS", "Acompanha pendencias sem deixar acumular"),
          criterion("DOCUMENTOS", "Organiza documentos de forma clara e rastreavel", { isCritical: true }),
          criterion("ROTINA", "Segue processos administrativos combinados", { isCritical: true })
        ]
      },
      {
        code: "CONFIABILIDADE",
        title: "Confiabilidade",
        criteria: [
          criterion("PRECISAO", "Entrega informacoes e registros sem erros relevantes", { isCritical: true, weight: 3 }),
          criterion("PRAZOS", "Cumpre prazos sem necessidade de cobranca recorrente", { isCritical: true }),
          criterion("SIGILO", "Trata informacoes confidenciais com discricao", { isCritical: true, weight: 3 }),
          criterion("DETALHES", "Confere detalhes antes de concluir entregas")
        ]
      },
      {
        code: "COMUNICACAO",
        title: "Comunicacao e Atitude",
        criteria: [
          criterion("SETORES", "Comunica-se bem com os setores"),
          criterion("CLAREZA", "Explica informacoes de forma clara"),
          criterion("PROATIVIDADE", "Sinaliza inconsistencias antes que virem problema", { isCritical: true }),
          criterion("ACOMPANHAMENTO", "Da retorno sobre demandas em aberto")
        ]
      }
    ]
  },
  {
    code: "HG_LIDERANCA",
    name: "Avaliacao de Lideranca Operacional",
    description: "Modelo para governanta, lideres de A&B e liderancas operacionais, com foco em equipe, decisao, integracao e padrao.",
    evaluationType: "periodic",
    defaultFrequency: "semiannual",
    passingScore: 3.5,
    sections: [
      {
        code: "EQUIPE",
        title: "Lideranca da Equipe",
        criteria: [
          criterion("ORIENTACAO", "Orienta a equipe com clareza no inicio do turno", { isCritical: true }),
          criterion("COBRANCA", "Cobra padrao com firmeza e respeito", { isCritical: true }),
          criterion("FEEDBACK", "Corrige desvios sem constrangimento publico", { isCritical: true }),
          criterion("DESENVOLVIMENTO", "Desenvolve a equipe tecnicamente e comportamentalmente")
        ]
      },
      {
        code: "SETOR",
        title: "Organizacao do Setor",
        criteria: [
          criterion("PADRAO", "Garante funcionamento do setor dentro do padrao", { isCritical: true }),
          criterion("AUSENCIAS", "Reorganiza tarefas diante de ausencias ou imprevistos"),
          criterion("CHECKLISTS", "Garante entrega de checklists e registros", { isCritical: true }),
          criterion("INDICADORES", "Acompanha sinais e indicadores do setor")
        ]
      },
      {
        code: "DECISAO_INTEGRACAO",
        title: "Decisao e Integracao",
        criteria: [
          criterion("DECISAO", "Resolve situacoes do dia a dia com bom julgamento", { isCritical: true }),
          criterion("PRIORIDADE", "Define prioridades com foco na operacao e no hospede", { isCritical: true }),
          criterion("INTEGRACAO", "Comunica-se bem com outros setores"),
          criterion("OCORRENCIAS", "Reporta ocorrencias relevantes no momento adequado", { isCritical: true })
        ]
      }
    ]
  }
];
