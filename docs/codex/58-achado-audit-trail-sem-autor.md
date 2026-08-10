# ACHADO NOVO — `audit_trail` nunca grava o autor (GUC nunca setado)

**Registro apenas. Não corrigido nesta fatia.** Encontrado durante o inventário de
triggers da fatia #7 (plano 51), confirmado pelo revisor e medido em staging.

---

## O que acontece

A auditoria genérica do sistema é o trigger `write_audit_trail`
([008_triggers_updated_at_soft_delete_audit.sql](../../supabase/migrations/008_triggers_updated_at_soft_delete_audit.sql)),
ligado como `after insert or update or delete` em praticamente todas as tabelas de
negócio — Compras (013), Base (011), Orçamento (012), RH (021, 022, 041, 042, 047, 048,
054, 056, 060, 062 …).

Para saber **quem** fez a mudança, ele chama `current_actor_id_from_setting()`, que lê o
GUC de sessão:

```sql
raw_value := current_setting('app.current_user_id', true);
```

**Ninguém no app seta esse GUC.** Varredura em `src/`: zero ocorrências de
`app.current_user_id` ou de qualquer `set_config`/`set local`. O único lugar onde a string
aparece em todo o repositório é a própria definição da função, na 008.

Resultado: `audit_trail.app_user_id` é **sempre NULL**.

## Medição (staging, read-only)

```
audit_trail: 2.771 linhas
amostra de 1.000:
  com app_user_id preenchido: 0
  com app_user_id NULL:       1000
```

Zero. Não é uma degradação recente nem um caso de borda — a coluna nunca foi populada.

## Por que importa

- **A trilha registra o quê e o quando, nunca o quem.** `old_value`/`new_value` estão lá,
  o autor não. Numa investigação — "quem alterou o salário deste colaborador?", "quem
  mudou esta cotação?" — a `audit_trail` não responde.
- **LGPD.** Registro de operações sobre dados pessoais sem identificação do agente
  enfraquece a demonstração de conformidade. O módulo de RH grava CPF, e-mail pessoal,
  dados de saúde ocupacional e desligamentos, todos cobertos por esse trigger.
- **Falso senso de segurança.** O sistema *parece* auditado: as tabelas existem, os
  triggers disparam, as linhas acumulam. A ausência só aparece quando alguém precisa da
  informação — que é o pior momento para descobrir.
- **Não é o mesmo que a auditoria explícita.** Onde a aplicação escreve na `audit_trail`
  por conta própria (ex.: `writeProfilePermissionAudit` em
  `admin/permissions/profiles/route.ts`), o `app_user_id` **é** preenchido. O buraco é só
  no caminho automático via trigger — que é o que cobre a maioria das tabelas.

## Por que não foi corrigido na #7

O escopo da #7 é atomicidade das mutações de cotação. As RPCs da migration 083 setam
`created_by`/`updated_by = p_actor_id` em toda escrita, exatamente como a rota fazia —
mantendo a auditoria **idêntica ao comportamento atual**. Introduzir o `set_config` do GUC
dentro dessas RPCs consertaria o autor apenas para as quatro mutações de cotação e deixaria
todo o resto do sistema como está: uma correção parcial que tornaria a `audit_trail`
inconsistente (algumas linhas com autor, a esmagadora maioria sem), e mais difícil de
diagnosticar depois.

## Caminhos possíveis (a decidir em fatia própria)

1. **`set_config('app.current_user_id', <userId>, true)` por request**, num ponto único —
   o gate de permissão (`requirePermission`) é o candidato natural, já que toda rota
   autenticada passa por ele. Problema: o pooler do Supabase pode reciclar conexões entre
   requests; `set_config(..., true)` é local à transação, e o supabase-js não abre
   transação explícita por request. Precisa de validação antes de prometer.
2. **Passar o ator explicitamente às RPCs e escrever a `audit_trail` dentro delas** —
   funciona onde há RPC (079, 081, 083), mas não cobre as escritas diretas do PostgREST,
   que são a maioria.
3. **Trocar a fonte do autor**: derivar de `updated_by`/`created_by` da própria linha
   dentro do `write_audit_trail`, com fallback para o GUC. É a opção de maior cobertura
   com menor mudança na aplicação — quase toda escrita já preenche esses campos. Exige
   migration na 008 e cuidado com DELETE (usar `old.updated_by`).

**Preferência preliminar: opção 3**, por cobrir o parque inteiro sem depender de
comportamento de pooler. Mas é palpite fundamentado, não conclusão — a fatia precisa medir
quantas tabelas realmente preenchem `updated_by` antes de decidir.

## Relacionados

- [51](51-plano-quote-values-rpc-transacional.md) — fatia onde o achado apareceu.
- [55](55-plano-observabilidade-e-alerta-cron.md) — observabilidade; o mesmo tema de
  "não dá para investigar o que não foi registrado".
