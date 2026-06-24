# Plano — Conserto do helper de identidade do RLS (Fase 1)

> **Contexto:** descoberto ao testar o RLS (Prompt 2) no staging. As policies estão
> corretas, mas o RLS funciona como "tranca total" para acesso autenticado, não como
> "filtro por unidade", porque o helper de identidade não resolve quem é o usuário.
> **Área SENSÍVEL** (`NAO_ALTERAR.md`: helpers de sessão/permissão). Plano → revisão → código.
> **Ambiente de teste:** staging (já tem RLS etapa 1 aplicado).

---

## 1. Causa raiz (confirmada)

O helper `public.current_auth_user_id()` (migration 009, linhas 5-15) lê o identificador
do usuário de `current_setting('request.jwt.claim.sub')` — o formato ANTIGO do Supabase,
onde cada claim do JWT virava um GUC separado.

O staging usa uma versão ATUAL do Supabase (chaves `sb_publishable_`/`sb_secret_`), na qual
o PostgREST não popula mais os GUCs por-claim individuais (`request.jwt.claim.sub`) e sim um
único GUC com o JSON inteiro: `request.jwt.claims`.

Resultado: `current_auth_user_id()` retorna NULL → `current_app_user_id()` retorna NULL →
`user_has_unit_access()` retorna false para tudo → o usuário authenticated não vê nem a
própria unidade. (Prova: nos testes, app_users/user_unit_links/units retornaram 0 linhas
para o próprio usuário logado; INSERT cross-unit foi bloqueado trivialmente.)

O próprio comentário do helper na 009 admite que era um rascunho: "Helper preparado para
Sprint 3, quando Supabase Auth será ligado ao app_users.auth_user_id."

**Importante:** o app NÃO é afetado (APIs usam service_role, que ignora RLS). Isto é
correção de defesa em profundidade, não de bug em produção.

---

## 2. Objetivo

Fazer `current_auth_user_id()` resolver a identidade na versão atual do Supabase, lendo o
`sub` do JWT de forma tolerante aos DOIS formatos (novo e antigo), sem quebrar nada.

Não alterar `current_app_user_id()` nem `user_has_unit_access()` — eles já funcionam
*desde que* `current_auth_user_id()` devolva o UUID certo.

---

## 3. Mudança proposta (migration nova, ex.: 067)

Reescrever apenas `public.current_auth_user_id()` para tentar, em ordem:

1. `request.jwt.claim.sub` (formato antigo) — se populado e for UUID válido, usar.
2. Senão, ler `request.jwt.claims` (formato novo), extrair `->>'sub'` do JSON, validar UUID.
3. Senão, NULL (comportamento seguro atual).

Pseudo-SQL (a confirmar na escrita):
```sql
create or replace function public.current_auth_user_id()
returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    nullif((current_setting('request.jwt.claims', true)::json ->> 'sub'), '')::uuid
  );
$$;
```
(Com a mesma validação de formato UUID que a versão atual tem, para não quebrar em valor
inválido. Detalhe de cast seguro a definir no código.)

Alternativa a avaliar na escrita: usar a função nativa `auth.uid()` do Supabase, que já
lida com os dois formatos. Decidir entre "consertar nosso helper" vs "delegar para
auth.uid()". Recomendação preliminar: tornar nosso helper tolerante (menos acoplado ao
interno do Supabase), mas avaliar auth.uid() como referência.

---

## 4. Restrições

- Área sensível (helpers de sessão). Não tocar em login, Supabase Auth, `auth_email`,
  nem em `current_app_user_id`/`user_has_unit_access` (só no `current_auth_user_id`).
- Migration NOVA; não editar a 009.
- Testar SOMENTE no staging primeiro.

---

## 5. Teste (staging) — o que prova o conserto

Reusar o script de teste de escopo já existente. Após aplicar o conserto:
1. Controle positivo: macos.wilson (restrito a GALLI PRAIA) deve passar a VER a própria
   unidade, o próprio app_users e o próprio vínculo (hoje retornam 0).
2. Escopo: com dados cadastrados em duas unidades, macos.wilson vê só GALLI PRAIA, nunca
   Hotel Galli.
3. INSERT cross-unit continua bloqueado.
4. wilson.admin (nas duas unidades) vê as duas.
Pré-requisito de teste: cadastrar alguns dados (departments, etc.) em cada unidade, senão
"ver a própria unidade" continua dando 0 por falta de dados (não por RLS).

---

## 6. Critério de aceite

- Usuário autenticado (via anon key) passa a enxergar dados da própria unidade.
- Continua sem enxergar dados de outra unidade (leitura e escrita).
- App (service_role) intocado.
- Só o helper `current_auth_user_id` alterado; 009 não editada.

---

## 7. Depois (não nesta tarefa)

- Aplicar o conserto também em produção (após validar no staging).
- Remover a função temporária `diag_jwt_context` do staging (limpeza).
- Seguir para Etapa 2 do RLS (RH sensível) + Prompt 3 (LGPD).
