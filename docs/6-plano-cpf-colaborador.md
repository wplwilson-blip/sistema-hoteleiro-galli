# Plano — CPF único e validação de colaborador (Fase 1)

> **Objetivo:** impedir CPF duplicado de colaborador e validar formato/dígito de CPF.
> Origem: docs/tarefa-cpf-telefone-colaborador.md (já documentada).
> **Área SENSÍVEL:** mexe em migration (índice único em employees) → plano antes do código.
> **Decisão de negócio confirmada por Wilson:** CPF único POR ORGANIZAÇÃO (mesmo CPF pode
> existir em organizações diferentes da rede, mas não duas vezes na mesma).
> **Pré-requisito verificado:** zero duplicatas em staging E produção (checado). Caminho limpo.
> **Regra de ouro:** migration aplicada nos DOIS bancos (staging + produção).

---

## 1. Estado atual (verificado)

- `employees` tem `organization_id`, `unit_id`, `document_number` (o CPF), `phone`.
- `document_number` NÃO tem unicidade nenhuma. CPF duplicado é aceito hoje.
- A migration `014_suppliers_unique_document.sql` já faz índice único por organização para
  SUPPLIERS — é o molde exato a copiar para employees.
- Schema de validação do colaborador: src/lib/base-cadastros/schemas.ts (campos phone já existem;
  não há validação de CPF/dígito).
- Próxima migration: 068.

## 2. Escopo

### Parte A — Índice único de CPF (banco) — PRIORIDADE
Criar índice único de CPF em `employees`, por organização, espelhando a 014:
- normaliza dígitos: `regexp_replace(coalesce(document_number,''), '\D', '', 'g')`
- escopo: `organization_id` + CPF normalizado
- ignora nulos/vazios: `where ... nullif(...) is not null`
- respeita soft delete: `where deleted_at is null`

SQL planejado (migration 068):
```sql
create unique index if not exists employees_org_cpf_normalized_active_unique
  on public.employees (
    organization_id,
    (regexp_replace(coalesce(document_number, ''), '\D', '', 'g'))
  )
  where deleted_at is null
    and nullif(regexp_replace(coalesce(document_number, ''), '\D', '', 'g'), '') is not null;
```

### Parte B — Validação de CPF (backend/schema)
- No schema do colaborador (src/lib/base-cadastros/schemas.ts), adicionar validação de
  dígito verificador de CPF (algoritmo padrão, SEM lib nova — é simples).
- Aceitar CPF com ou sem máscara (normalizar antes de validar).
- CPF inválido → erro de validação (422) com mensagem em português.
- Tratar o erro de índice único (violação) no backend → 409 com mensagem amigável
  ("Já existe um colaborador com este CPF nesta organização.").

### Parte C — Máscaras (frontend) — qualidade de digitação
- Máscara de CPF (000.000.000-00) no input de document_number.
- Máscara de celular ((00) 00000-0000) no input de phone.
- Sem lib nova (máscara simples na digitação).

## 3. Restrições (NAO_ALTERAR)

- Migration é área sensível — este plano antes do código.
- NÃO alterar Auth, login, auth_email.
- NÃO introduzir dependência nova só para validar/mascarar CPF.
- Migration nova (068); não editar migrations aplicadas.
- Aplicar nos dois bancos (staging primeiro, validar, depois produção).

## 4. Teste (staging primeiro)

1. Tentar cadastrar dois colaboradores com o mesmo CPF na mesma organização → 2º deve ser
   BLOQUEADO (409, mensagem amigável).
2. Cadastrar o mesmo CPF em organização diferente → deve PERMITIR (escopo por organização).
3. CPF com dígito verificador inválido → rejeitado na validação (422).
4. CPF com máscara e sem máscara → ambos normalizados e validados igual.
5. Colaborador sem CPF (nulo) → permitido (não quebra cadastros sem CPF).
6. Cadastros existentes não quebram.

## 5. Critério de aceite

- Não dá pra cadastrar CPF duplicado na mesma organização.
- CPF inválido é rejeitado.
- CPF/celular com máscara na digitação.
- Índice criado nos dois bancos (regra de ouro).
- Lint e build passam; cadastros existentes intactos.

## 6. Ordem de execução sugerida

1. Migration 068 (índice) → revisar → aplicar no staging → testar duplicata → aplicar produção.
2. Validação de dígito no schema + tratamento de 409 no backend.
3. Máscaras no frontend.
(Pode ser uma leva só, ou fatiado: índice primeiro, validação/máscara depois.)
