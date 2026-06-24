# Pendências e itens de roadmap — Hotel Galli

> Consolidado da sessão. Itens descobertos durante a implementação do Prompt 1b e a
> montagem do ambiente de staging. Ordenados por natureza, não necessariamente por
> prioridade de execução.

---

## Estado atual (concluído nesta sessão)

- **Prompt 1b (alçada de aprovação)** — implementado, revisado, aplicado em produção e
  mergeado no `main` (commit `15bf0b6`). Grants validados no banco: GA (`DEPARTMENT_MANAGER`)
  só `approvals.decide.administrative`; `UNIT_DIRECTOR` e `NETWORK_MANAGER` com as duas
  permissões; `approvals.decide` antiga revogada; SUPER_ADMIN decide tudo por atalho.
- **Staging Supabase** (`galli-staging`) criado e com as 65 migrations aplicadas.
- **Saneamento de migrations** — 040 (BOM), 058 e 059 (modelo obsoleto `role_permissions` +
  formato antigo de `permissions`) corrigidos e mergeados no `main`.

---

## Pendências imediatas (do próprio fluxo)

1. **Setup de usuários de teste no staging** — Super Admin criado; usuários COMPRAS
   (`macos.wilson`), e outros perfis a confirmar. Senhas resetadas via SQL
   (`crypt`/`gen_salt`). Falta: confirmar um `DEPARTMENT_MANAGER` e um `UNIT_DIRECTOR`
   logáveis para teste de ponta a ponta do 1b.
2. **Grants de conduta** — as permissões `HR:conduct.*` existem mas não estão concedidas a
   nenhum perfil (descoberto ao sanear 058/059). Decisão de RH/LGPD sobre quem acessa
   conduta de colaborador. Candidato a entrar junto do Prompt 3 (dados sensíveis/LGPD).

---

## Bugs descobertos (não relacionados ao 1b)

### B1 — Tela de salvar cotação não envia (frontend)
- **Sintoma:** ao salvar cotação como perfil COMPRAS no staging, o botão não dispara
  requisição (nada na aba Network), sem mensagem de erro visível.
- **Não é permissão:** COMPRAS tem `PURCHASES:quotes.manage` (migration 064, confirmado).
- **Suspeita:** validação no frontend (`src/components/purchases/purchase-quotes-client.tsx`)
  com early-returns (`setError` + `return` nas linhas ~1125-1160) abortando o submit, ou
  `selectedRequest` nulo travando o form. Mensagem de erro pode estar renderizada em local
  não visível do modal.
- **Investigar:** abrir DevTools → Console (erro de JS?) e revisar as validações do
  `onSubmit` do form de cotação. Bug de UI, não de segurança.

---

## Lacunas de gestão de usuário (operacional — dói quando o hotel operar)

Descobertas durante a criação/recriação de usuários de teste:

### U1 — Sem reset de senha pela interface
- Não há rota/tela de redefinição de senha. Hoje só por SQL (`update auth.users set
  encrypted_password = crypt(...)`). Inviável para operação real.

### U2 — Exclusão de usuário inconsistente
- Deletar usuário pelo painel do Supabase Auth deixa registro órfão em `public.app_users`
  (e vínculos em `user_unit_links`). Não há fluxo que limpe os dois lados juntos.

### U3 — Sem edição/correção de cadastro de usuário
- Username com typo (ex.: `macos.wilson`) só corrigível por SQL, e a correção quebra o
  login se o `auth_email` não for atualizado em conjunto.

> **Sugestão:** agrupar U1+U2+U3 numa tarefa "Gestão de usuário: reset de senha, exclusão
> consistente e edição", com plano antes (mexe em Auth — área sensível do NAO_ALTERAR.md).

---

## Qualidade de dado / integridade cadastral

### D1 — CPF e telefone de colaborador (já detalhado em doc próprio)
- `employees.document_number` sem índice único (aceita CPF duplicado; índice único existe
  só para `suppliers`).
- Sem validação de dígito verificador nem máscara de CPF/telefone.
- Decisão de negócio pendente: CPF único por organização ou global?
- Ver documento: `tarefa-cpf-telefone-colaborador.md`.

---

## Infraestrutura / processo

### I1 — Migrations do repo divergiam do banco real
- Resolvido nesta sessão (040/058/059). Lição: o banco de produção foi construído com
  correções manuais no SQL Editor que não voltaram para os arquivos. Recomenda-se, daqui
  pra frente, **toda** mudança de schema nascer como migration versionada e ser aplicada
  via CLI (`supabase db push`), nunca direto no SQL Editor sem virar arquivo.

### I2 — Banco único (local = deploy)
- `.env.local` aponta para o mesmo Supabase do Vercel. Staging agora existe (`galli-staging`)
  e deve ser o ambiente de teste do Prompt 2 (RLS) — não testar RLS direto no banco que
  vira produção.
- **Atenção:** o `.env.local` foi temporariamente apontado para o staging nesta sessão.
  Antes de voltar a publicar/trabalhar contra produção, restaurar de `.env.producao.bak`.

### I3 — Mensagem enganosa do SQL Editor
- UPDATE sem `RETURNING` no SQL Editor do Supabase mostra "Success. No rows returned" mesmo
  quando altera linhas. Usar `... returning <colunas>` para confirmar efeito de UPDATE/DELETE.

---

## Próximos passos sequenciados (roadmap original)

- **Prompt 2 — RLS policies** (P0): RLS habilitado em dezenas de tabelas com zero policy.
  Próximo da fila. Testar no staging.
- **Prompt 3 — LGPD** (P1): log de acesso a dados sensíveis + retenção. Bom momento para
  resolver os grants de conduta (item 2 acima).
- **Prompt 4 — Unidade ativa explícita** (P1).
- **Prompt 5 — Middleware + rate limit de login** (P2).
- **Prompt 6 — Refatorar componentes client gigantes** (P2).
