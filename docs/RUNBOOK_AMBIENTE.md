# Runbook de Ambiente — Sistema Hotel Galli

Passos **manuais** necessários para que um ambiente (staging ou produção) funcione, que **não**
são cobertos por migrations. Migrations cuidam do schema; este runbook cuida do resto — Storage,
variáveis de ambiente e verificações de paridade. A ordem das migrations em si está em
`supabase/README.md`; aqui só tratamos do que fica fora delas.

> Regra de ouro do projeto: toda **migration** aprovada vai para staging **e** produção.
> Mas migration **não** cobre buckets de Storage nem variáveis de ambiente — por isso este runbook.

---

## Ambientes

| Ambiente   | Projeto Supabase  | Ref                      | Observação                         |
| ---------- | ----------------- | ------------------------ | ---------------------------------- |
| Staging    | `galli-staging`   | `jascnmgagejlvjlenduv`   | Org "Exkontrol". Usado no dev.     |
| Produção   | (preencher)       | (preencher)              | Deploy real na Vercel.             |

`.env.local` aponta para **staging** no desenvolvimento. A Vercel usa suas **próprias**
variáveis de ambiente (produção) — independentes do `.env.local`.

---

## 1. Storage (buckets) — NÃO coberto por migration

Cada ambiente novo precisa ter os buckets criados **manualmente** no painel do Supabase
(Storage → New bucket). Se faltar, o upload falha em silêncio com erro tipo
`StorageApiError: Bucket not found` e o POST `/api/attachments` retorna 500.

| Bucket        | Visibilidade | Uso                                              |
| ------------- | ------------ | ------------------------------------------------ |
| `attachments` | **Privado**  | Anexos operacionais (evidências de cotação etc.) |

Checklist por ambiente:
- [ ] Bucket `attachments` existe.
- [ ] Está marcado como **privado** (não público).

> Histórico: o `attachments` faltava no staging e teve de ser criado na mão; produção já o tinha.
> Este é o exemplo clássico do porquê deste runbook existir.

---

## 2. Variáveis de ambiente

As três variáveis do Supabase precisam estar corretas **em cada ambiente** (no `.env.local` para
dev/staging; no painel da Vercel para produção). Os **valores são diferentes por ambiente** —
nunca reutilizar a chave de um ambiente em outro.

| Variável                        | Onde pegar (Supabase → Settings → API)                       |
| ------------------------------- | ------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Project URL do ambiente.                                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave `anon` pública do ambiente.                            |
| `SUPABASE_SERVICE_ROLE_KEY`     | Chave **service_role clássica (JWT `eyJ…`)** — ver aviso.    |

### ⚠️ Aviso crítico sobre a `SUPABASE_SERVICE_ROLE_KEY`

Com RLS ativo, **a chave service_role precisa ser a JWT clássica** (formato `eyJ…`, na aba
"Legacy anon, service_role API keys" em Settings → API Keys). Só essa tem `rolbypassrls` e
ignora as policies.

- As chaves novas no formato `sb_secret_…` ("Secret keys") **NÃO** ignoram RLS — são tratadas
  como usuário normal e ficam sujeitas às policies.
- Usar a chave errada faz `hasActiveSuperAdmin` retornar `false` e o app cair na tela de
  **setup inicial** (sintoma silencioso e confuso).
- Cada ambiente tem a SUA service_role. **Nunca** aplicar a chave de staging na Vercel de
  produção (já aconteceu uma vez nesta jornada).

Checklist por ambiente:
- [ ] `NEXT_PUBLIC_SUPABASE_URL` aponta para o projeto **deste** ambiente.
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` é a anon **deste** ambiente.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` é a **service_role JWT clássica** (`eyJ…`) **deste** ambiente.
- [ ] Em produção: as três estão no painel da **Vercel**, não só no `.env.local`.

---

## 3. Migrations (referência cruzada)

A estrutura de banco é versionada em `supabase/migrations/` (ordem detalhada em
`supabase/README.md`). Regra de ouro: toda migration aprovada é aplicada a **staging e produção**.

Checklist ao subir uma migration nova:
- [ ] Aplicada em **staging**.
- [ ] Aplicada em **produção**.
- [ ] As duas ficaram com o mesmo conjunto de migrations (sem defasagem).

> Para conferir defasagem, comparar a lista de migrations aplicadas em cada projeto Supabase.

---

## 4. Checklist de paridade staging ↔ produção

Rodar quando criar um ambiente novo, ao desconfiar de divergência, ou após mexer em infra:

- [ ] **Migrations**: mesmo conjunto aplicado nos dois bancos.
- [ ] **Buckets**: `attachments` (privado) existe nos dois.
- [ ] **Env vars**: as três variáveis corretas e **específicas de cada ambiente** (atenção à
      service_role JWT clássica).
- [ ] **Deploy**: último build da Vercel (do `main`) verde.
- [ ] **Dados de teste não vazam para produção**: usuários/permissões marcados `[E2E]`
      (ex.: overrides do `e2e_multi` em `user_permission_overrides`) existem **apenas no
      staging** — não replicar em produção.

---

## 5. Sintomas comuns e causa provável

| Sintoma                                                        | Causa provável                                              |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| Upload falha; `Bucket not found`; `/api/attachments` 500       | Bucket `attachments` não existe neste ambiente (seção 1).   |
| App cai na tela de **setup inicial** sem motivo                | `SUPABASE_SERVICE_ROLE_KEY` errada (não é a JWT clássica).   |
| Funciona em staging mas quebra em produção (ou vice-versa)     | Divergência de migration, bucket ou env var entre ambientes.|
| `over_request_rate_limit` (429) no login                       | Rate limit do Supabase Auth por tentativas repetidas.       |

---

## Notas de manutenção deste runbook

- Atualizar a tabela de **Ambientes** com o ref/nome reais de produção.
- Ao adicionar um bucket novo, registrar na seção 1 (Storage não entra em migration).
- Ao adicionar env var nova, registrar na seção 2.
