# Direção Arquitetural do Produto: Backoffice Hoteleiro e PMS Futuro

## 1. Visão atual do sistema

O Sistema Administrativo Hotel Galli é, neste momento, um backoffice operacional hoteleiro. O foco atual é apoiar processos internos de RH, Compras, Contas a Pagar com aprovação, Manutenção, Governança, A&B, Administrativo, Cadastros, anexos, evidências, auditoria e rastreabilidade por unidade.

O sistema ainda não é PMS. Ele não deve assumir, nesta fase, responsabilidades de reservas, disponibilidade, check-in, checkout, tarifário, channel manager, motor de reservas, emissão fiscal ou financeiro completo.

O bloco em andamento deve continuar priorizando a finalização do RH administrativo antes de iniciar fundações PMS.

## 2. Visão futura

A direção futura do produto é evoluir, no longo prazo, para uma plataforma hoteleira mais completa, com capacidade de substituir sistemas externos de PMS quando houver maturidade funcional, técnica, operacional e de dados.

Essa visão futura não autoriza construir PMS agora. Ela serve para orientar decisões novas, evitando modelos, telas, APIs e regras que impeçam a evolução posterior para quartos/UHs, tipos de UH, status de UH, bloqueios, manutenção, governança, hóspedes, ocorrências, FNRH e, somente depois, reservas e operações formais de estadia.

## 3. Princípios arquiteturais obrigatórios

- Finalizar RH antes de iniciar um grande bloco PMS.
- Preservar o sistema atual como backoffice operacional até decisão explícita de escopo PMS.
- Projetar novas entidades operacionais considerando organização, unidade, autoria, histórico e soft delete quando fizer sentido.
- Evitar regras específicas do Hotel Galli hardcoded quando puderem virar configuração.
- Caminhar para parametrização de textos, nomes, limites, aprovações, alçadas e regras operacionais.
- Manter separação clara entre colaborador, usuário interno, fornecedor, hóspede e outros papéis futuros.
- Validar permissões no backend para ações sensíveis.
- Registrar auditoria/histórico para eventos operacionais importantes.
- Não criar dependência técnica que dificulte multiunidade, multi-tenant ou PMS futuro.

## 4. O que NÃO deve ser feito agora

Não construir neste momento:

- Reservas.
- Disponibilidade.
- Check-in.
- Checkout.
- Tarifário.
- Financeiro completo.
- Emissão fiscal.
- Channel manager.
- Motor de reservas.
- PMS completo.

Também não devem ser criadas migrations, APIs, telas ou regras de negócio PMS sem sprint específica e autorização explícita. A tarefa atual de arquitetura é documentação e direcionamento, não implementação funcional.

## 5. Regras para novas telas, APIs e tabelas

Toda nova tela, API ou tabela deve considerar, quando aplicável:

- `organization_id`.
- `unit_id`.
- `created_by`.
- `updated_by`.
- `created_at`.
- `updated_at`.
- `deleted_at`.

Esses campos não precisam ser adicionados mecanicamente a toda tabela sem análise, mas devem ser padrão para entidades operacionais importantes. Exceções devem ser conscientes e documentadas.

APIs sensíveis não devem confiar em `organization_id`, `unit_id` ou usuário enviados livremente pelo frontend. O escopo deve vir da sessão, dos vínculos de unidade e da camada server-side de permissão.

Telas operacionais devem evitar expor códigos técnicos ao usuário. Códigos internos podem existir no banco e na aplicação, mas a interface deve usar labels claros em português.

## 6. Cuidados com Hotel Galli hardcoded

O sistema atende o Hotel Galli hoje, mas deve evitar acoplar regras permanentes ao nome, estrutura, pessoas ou hábitos específicos da operação atual.

Devem caminhar para configuração quando houver repetição ou variação previsível:

- Nomes de alçadas.
- Limites de aprovação.
- Textos operacionais.
- Nomes de departamentos e grupos.
- Regras de exigência documental.
- Fluxos de aprovação.
- Status visíveis.
- Políticas por unidade.

Hardcode temporário pode ser aceitável em V1 quando reduz risco e acelera validação, mas deve ficar isolado, com nome claro e caminho de evolução para parametrização.

## 7. Organização, unidade e futuro multi-tenant

A arquitetura deve tratar organização e unidade como eixos centrais do produto.

Hoje, a organização pode representar a rede atual. No futuro, o modelo deve permitir múltiplas organizações e múltiplas unidades sem misturar dados, permissões, relatórios, cadastros, anexos ou auditoria.

Novas entidades devem responder claramente:

- A qual organização pertencem?
- A qual unidade pertencem?
- Podem existir em nível corporativo?
- Podem ser compartilhadas entre unidades?
- Quem pode visualizar, criar, alterar, aprovar ou arquivar?

Quando uma entidade puder existir tanto em nível corporativo quanto por unidade, essa escolha deve ser modelada explicitamente, não inferida por regra oculta.

## 8. Permissões e auditoria

A camada de permissões precisa evoluir para considerar:

- Módulo.
- Ação.
- Unidade.
- Perfil.
- Eventuais responsabilidades específicas por fluxo.

Esconder botão no frontend não é autorização suficiente. A decisão final deve ocorrer no backend.

Eventos importantes devem ter histórico/auditoria, incluindo usuário, data, unidade, ação, estado anterior quando relevante, novo estado quando relevante e justificativa quando aplicável.

São exemplos de eventos que devem ter rastreabilidade:

- Aprovações.
- Reprovações.
- Devoluções.
- Alterações de status operacional.
- Envio formal de dossiês.
- Mudanças em dados sensíveis.
- Bloqueios ou liberações futuras de UH.
- Ocorrências de recepção, governança e manutenção.

## 9. Dados sensíveis e LGPD

RH, hóspedes, documentos, anexos, evidências e ocorrências podem conter dados pessoais ou sensíveis.

Novas funcionalidades devem considerar:

- Minimização de dados coletados.
- Controle de acesso por necessidade operacional.
- Auditoria de acesso e alteração quando houver dado sensível.
- Evitar exposição desnecessária em dashboards, listagens e exports.
- Tratamento cuidadoso de anexos.
- Separação entre dados internos, dados de colaboradores e dados de hóspedes.

Futuros dados de hóspedes, FNRH, documentos pessoais e ocorrências devem ser tratados como áreas sensíveis desde a modelagem inicial.

## 10. Caminho recomendado após finalizar RH

Após finalizar RH, o próximo grande bloco recomendado é a fundação PMS sem reservas.

Antes de qualquer reserva, tarifário ou disponibilidade comercial, o sistema deve consolidar a base operacional que um PMS precisará consumir:

- Unidades e setores operacionais bem definidos.
- Quartos/UHs.
- Tipos de UH.
- Status operacionais de UH.
- Bloqueios de UH.
- Governança ligada a UH.
- Manutenção ligada a UH e áreas comuns.
- Recepção operacional com ocorrências e passagem de turno.
- Cadastros e histórico preparados para hóspedes futuros.

Essa sequência reduz risco, porque cria o vocabulário operacional do hotel antes de criar venda, hospedagem e disponibilidade.

## 11. Fundação PMS sem reservas

A fundação PMS sem reservas deve começar por entidades e fluxos operacionais que não vendem hospedagem e não movimentam check-in/checkout.

Prioridade recomendada:

- Quartos/UHs por organização e unidade.
- Tipos de UH com atributos básicos.
- Status operacional de UH, separado de disponibilidade comercial.
- Bloqueios operacionais e técnicos.
- Chamados de manutenção vinculados a UH ou área comum.
- Governança com inspeções, checklists, limpeza, achados e ocorrências.
- Recepção operacional com passagem de turno, ocorrências, solicitações internas e observações.
- Estrutura futura para hóspedes e FNRH, sem ativar fluxo de hospedagem ainda.

Disponibilidade, reservas, tarifas, channel manager, motor de reservas, check-in e checkout devem vir apenas depois dessa fundação estar estável e autorizada em sprint própria.

## 12. Riscos se ignorarmos esta diretriz

Ignorar esta diretriz pode gerar:

- Mistura de dados entre unidades.
- Regras específicas do Hotel Galli difíceis de remover.
- Telas e APIs que não suportam multi-tenant.
- Permissões frágeis ou apenas visuais.
- Falta de auditoria para decisões importantes.
- Dificuldade para modelar quartos, hóspedes e operações PMS no futuro.
- Retrabalho em tabelas já usadas por módulos críticos.
- Exposição indevida de dados sensíveis.
- Evolução prematura para PMS sem base operacional estável.
- Bloqueio técnico para substituir sistemas externos no longo prazo.

## 13. Checklist para próximas sprints

Antes de iniciar ou revisar uma sprint, Codex/desenvolvedor deve verificar:

- [ ] Esta alteração respeita organização e unidade?
- [ ] Existe risco de misturar dados entre unidades?
- [ ] Existe regra do Galli hardcoded que deveria ser configurável?
- [ ] A permissão por perfil foi considerada?
- [ ] A ação precisa de histórico/auditoria?
- [ ] A tela expõe dado sensível?
- [ ] Isso ajuda ou atrapalha o PMS futuro?
- [ ] Isso deveria estar ligado a quarto/UH, hóspede, colaborador, fornecedor, unidade ou departamento?
- [ ] Isso cria dependência que ficará difícil de mudar quando houver PMS?
- [ ] Isso deveria esperar a finalização do RH?
