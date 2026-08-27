# 66 — Plano: autor na `audit_trail` derivado da própria linha (opção 3 do doc 58)

**Área SENSÍVEL** (trigger de auditoria — `docs/NAO_ALTERAR.md`).
Branch: `security/audit-trail-author-from-row`. **Migration-only**: nenhum arquivo de `src/` é tocado.
Migration `086` **não é aplicada pelo Codex** — o Wilson aplica, staging → produção.

Decisões travadas: opção 3 (autor derivado da linha); GUC na frente (`coalesce(GUC, derivado)`); UUID validado antes de qualquer cast; sem backfill de históricos; hard-delete usa o último que escreveu.

---

## 1. O problema, em uma linha

`audit_trail.app_user_id` é **sempre NULL**. O trigger `write_audit_trail` ([008:46](../../supabase/migrations/008_triggers_updated_at_soft_delete_audit.sql#L46)) lê o autor de um GUC de sessão (`app.current_user_id`) que **nenhum ponto da aplicação seta** — medido em staging: 0 de 1.000 linhas amostradas com autor. Registro completo do quê e do quando; do quem, nada.

Detalhe do doc 58 que continua valendo: onde a aplicação escreve na `audit_trail` **explicitamente** (ex.: `writeProfilePermissionAudit`), o autor **é** preenchido. O buraco é só no caminho automático via trigger — que é o que cobre praticamente todas as tabelas.

---

## 2. Cobertura esperada (medida, não estimada)

O doc 58 pediu para medir quantas tabelas realmente têm as colunas antes de decidir. Censo das 98 tabelas criadas nas migrations:

| Coluna | Tabelas | Cobertura |
| --- | --- | --- |
| `created_by` | 89 / 98 | **90 %** |
| `updated_by` | 86 / 98 | **87 %** |
| `deleted_by` | 86 / 98 | **87 %** |

As 12 sem `updated_by` são, em sua maioria, tabelas que **não deveriam** ter autor derivado mesmo: `audit_trail` (a própria trilha), `system_logs`, `auth_login_attempts`, `hr_workflow_idempotency_keys`, e tabelas de evento append-only (`purchase_request_events`, `purchase_approval_decisions`, `approval_actions`) que já carregam o autor em campo próprio (`decided_by`, `created_by`).

**Ou seja: a opção 3 sai de 0 % para a casa dos 87-90 % de cobertura sem tocar em uma linha de TypeScript.** Onde a coluna não existe, o `->>` devolve `null` e o comportamento é exatamente o de hoje — degrade gracioso, não erro.

**Aviso honesto sobre esse número:** ele mede a existência da **coluna**, não se a aplicação a **preenche** em cada escrita. A cobertura efetiva é ≤ 87 %, e o passo 2 do roteiro de validação (§5) é justamente medir a real depois de aplicar. Não prometo o número de cima como resultado.

---

## 3. O que a migration `086` faz

### 3.1 Helper novo: `public.safe_uuid(text)`

```
create or replace function public.safe_uuid(text) returns uuid
```

Aplica **o mesmo regex** de `current_actor_id_from_setting` ([008:24](../../supabase/migrations/008_triggers_updated_at_soft_delete_audit.sql#L24)) e devolve `null` quando não casa.

**Por que ele é obrigatório, e não zelo excessivo:** este trigger roda em **toda escrita de toda tabela** do sistema. Um `updated_by` malformado numa única linha — legado, importação, coluna `text` em vez de `uuid` — faria o cast `::uuid` lançar exceção. O `exception when others` no fim da função hoje engoliria isso e a escrita passaria, mas **sem linha de auditoria**: a trilha perderia o registro silenciosamente, que é o oposto do objetivo desta fatia. Com `safe_uuid`, valor ruim vira `null` e a linha de auditoria é gravada do mesmo jeito.

`stable`, sem `security definer` (não acessa tabela).

### 3.2 A derivação do autor

A única mudança no corpo de `write_audit_trail`: a linha

```
actor_id := public.current_actor_id_from_setting();
```

sai do topo e vira uma derivação **por operação**, dentro dos ramos `if tg_op` que **já existem** (onde `audit_action_value` é definido), reaproveitando os `new_json`/`old_json` já montados:

| Operação | Fonte do autor |
| --- | --- |
| `INSERT` | `safe_uuid(new_json->>'created_by')` |
| `UPDATE` (não soft-delete) | `safe_uuid(new_json->>'updated_by')` |
| `soft_delete` | `coalesce(safe_uuid(new_json->>'deleted_by'), safe_uuid(new_json->>'updated_by'))` |
| `DELETE` físico | `coalesce(safe_uuid(old_json->>'deleted_by'), safe_uuid(old_json->>'updated_by'))` |

Tudo envolvido em `actor_id := coalesce(public.current_actor_id_from_setting(), <derivado>)`.

**O GUC na frente** (decisão travada) importa: se um dia alguém implementar a opção 1 do doc 58 (`set_config` por request), ela passa a ter precedência automaticamente, sem nova migration. A derivação vira o fallback — que é a ordem certa, porque o GUC é o autor **da requisição** e a coluna é o autor **da última escrita**; quando os dois existem, o primeiro é mais preciso.

**Por que `deleted_by` antes de `updated_by` no soft-delete:** no soft-delete os dois são escritos na mesma operação, e `deleted_by` é o campo específico do ato que está sendo auditado.

**Hard-delete usa o último que escreveu** (decisão travada). Vale registrar a limitação: num `DELETE` físico não existe autor **do delete** na linha — `old_json` só tem quem escreveu por último. Se A criou e B apagou, a trilha vai dizer **A**. É melhor que o NULL de hoje, e é impreciso; quem fecha isso de verdade é o GUC (opção 1). Está comentado na própria migration para ninguém ler a coluna como "quem apagou".

### 3.3 O que NÃO muda

- **O resto do corpo é byte-idêntico à 008**: mesma declaração de variáveis, mesmos `nullif(...)::uuid` de `unit_id`/`entity_id`, mesmo `insert`, mesmo `coalesce(row_entity_id, gen_random_uuid())`, mesmo `exception when others`, mesmos retornos.
- **`security definer` e `set search_path = public`** preservados.
- **Nenhum trigger é recriado.** Os triggers referenciam a função pelo nome; `create or replace function` troca o corpo e todos passam a usar o novo, sem `drop`/`create` de trigger — sem janela em que a auditoria fique desligada.
- **Nenhuma outra função** é tocada: `current_actor_id_from_setting` e `update_updated_at_column` ficam como estão.
- **Sem backfill** (decisão travada): as ~2.771 linhas históricas continuam com `app_user_id` NULL. Derivar autor retroativo a partir do estado atual da linha seria **inventar** informação — o `updated_by` de hoje não é o autor daquela escrita de meses atrás.

---

## 4. Riscos

| Risco | Mitigação |
| --- | --- |
| UUID malformado numa coluna quebrar escrita | `safe_uuid` devolve `null`; nenhum cast direto (§3.1) |
| Perder linha de auditoria silenciosamente | Exatamente o que `safe_uuid` evita; o `exception when others` deixa de ser acionado por esse motivo |
| Janela sem auditoria durante a aplicação | Não existe: `create or replace function`, sem mexer em trigger (§3.3) |
| Autor errado no hard-delete | Declarado (§3.2) e comentado na migration |
| Regressão no corpo da função | Byte-identidade fora do `actor_id`; rollback com o corpo original no fim do `.sql` |

**A migration é reversível e não destrutiva:** não altera dados, não altera schema, só substitui o corpo de uma função. O rollback é reaplicar o corpo antigo, que está comentado no fim do arquivo (e a 008 permanece no repo como referência).

**Ordem de deploy: irrelevante.** O app não executa a migration nem conhece a função — não há acoplamento com deploy. Pode ser aplicada a qualquer momento, antes ou depois de qualquer merge.

---

## 5. Roteiro de validação (no próprio `.sql`, staging antes de produção)

1. **Autor no UPDATE.** Fazer um `update` numa linha de teste (pela aplicação, para `updated_by` ser preenchido de verdade) e conferir que a última linha de `audit_trail` daquela tabela tem `app_user_id` = o `updated_by` daquela escrita.
2. **Cobertura real.** Depois de alguns cliques reais no sistema:
   ```sql
   select count(*) filter (where app_user_id is not null) * 100.0 / nullif(count(*), 0)
   from public.audit_trail where created_at > now() - interval '5 minutes';
   ```
   É este número — não o 87 % do §2 — que diz o que a fatia realmente entregou.
3. **INSERT e soft-delete também populam.** Criar e depois inativar um registro pela aplicação; conferir as duas linhas de `audit_trail`.
4. **Nada quebrou.** Nenhuma escrita passou a falhar; a contagem de `audit_trail` continua crescendo no mesmo ritmo.

---

## 6. Entregáveis

| Item | Natureza |
| --- | --- |
| `supabase/migrations/086_audit_trail_author_from_row.sql` | novo — **o Wilson aplica** |
| `docs/codex/66-plano-audit-trail-autor.md` | este documento |

Nenhum arquivo de `src/`, nenhum teste unitário (não há código de aplicação para testar — a lógica vive no PL/pgSQL, e a verificação é o roteiro do §5).
