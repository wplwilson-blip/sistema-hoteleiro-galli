# Plano — #5: code de permissão inexistente vira 403 silencioso

**Área SENSÍVEL** (helper de permissão). Só plano.
Branch previsto: `fix/permission-code-misconfig-observable`.

---

## 0. Evidência reconferida

`src/lib/auth/permissions.ts` (numeração real, divergente da citada na auditoria):

- `:253-255` — ramo super admin: `unionUnitIds = todas as unidades ativas; hasPermission = true`.
  O `getPermissionId` **nunca é chamado** para super admin.
- `:257-260` — ramo não-super:
  ```ts
  const permissionId = await getPermissionId(supabase, permissionCode, options);
  if (!permissionId) {
    return { isSuperAdmin, accessibleUnitIds: [], hasPermission: false, hasPermissionInScope: false };
  }
  ```
  (a auditoria citou `:273-276` e `:257-271`; o conteúdo confere, as linhas deslocaram.)
- `getPermissionId` (`:137-156`) devolve `undefined` tanto para **code que não existe** quanto
  para code que existe mas está `status != 'active'` ou soft-deletado. Erro de query já vira
  500 (`:150-153`).
- `requirePermission` (`:338-343`) transforma `hasPermission=false` em **403 com mensagem
  genérica**.

**Consequência:** um typo num code (`"HR:documnets.view"`), uma permissão despublicada, ou um
`HR_PERMISSIONS` fora de sincronia com a tabela `permissions` produz **403 para toda a
equipe**, indistinguível de negação legítima, e **sem nenhum sinal** — o único log do sistema
é `console.error` e este caminho não loga nada.

Assimetria relevante: super admin **não** passa por `getPermissionId`, então o super admin
continua entrando e a misconfig fica invisível para quem investigaria.

---

## 1. Arquivos e linhas afetados

| Arquivo | Linhas | Mudança |
|---|---|---|
| `src/lib/auth/permissions.ts` | 137-156 | `getPermissionId` passa a distinguir "não existe" de "erro" |
| `src/lib/auth/permissions.ts` | 257-260 | code ausente → **erro 500 observável**, não `hasPermission:false` |
| `tests/unit/` (novo) | — | teste do novo ramo |

Sem migration.

---

## 2. Diff conceitual

```ts
// :257-260
  const permissionId = await getPermissionId(supabase, permissionCode, options);
  if (!permissionId) {
-   return { isSuperAdmin, accessibleUnitIds: [], hasPermission: false, hasPermissionInScope: false };
+   // MISCONFIG, nao negacao: o code pedido pela rota nao existe (ou esta inativo) no
+   // catalogo `permissions`. Devolver 403 aqui esconde um bug de deploy atras de uma
+   // resposta que parece regra de negocio. Falha alto e observavel.
+   logPermissionError(options, "permission_code_not_found", {
+     name: "PermissionMisconfiguration",
+     message: `Permission code ausente no catalogo: ${permissionCode}`,
+     code: permissionCode
+   });
+   throw new PermissionAuthorizationError(
+     options?.validationErrorMessage ?? defaultValidationErrorMessage,
+     500
+   );
  }
```

Nada mais muda. `logPermissionError` (`:89-100`) já roteia para `options.logError` (que no HR
é `logHrApiError` → prefixo `hr.`) ou para `logBaseCadastroError` com prefixo `permissions.`.
O stage novo `permission_code_not_found` é o gancho para o alerta do achado #8.

### 2.1 Por que 500 e não 403

- 403 diz ao usuário "você não tem direito" — falso, e não acionável por ninguém.
- 500 é a verdade: o servidor está mal configurado. Vira erro em qualquer sink de
  observabilidade que venha do #8, com o `code` no payload.
- A mensagem ao usuário permanece a genérica de validação ("Nao foi possivel validar as
  permissoes…"), **sem vazar** o code interno.

### 2.2 Efeito colateral a aceitar conscientemente

Uma rota que hoje devolve 403 silencioso passará a devolver **500**. Se existir hoje alguma
rota apontando para um code inexistente, ela **quebra de forma visível** no deploy. Isso é o
objetivo — mas exige uma verificação prévia.

**Tarefa de pré-implementação (Fase B, antes do fix):** um script único que compara todos os
codes literais usados no `src/` (`HR_PERMISSIONS`, `BASE_PERMISSIONS`,
`PURCHASES_PERMISSIONS`, `ATTACHMENTS_PERMISSIONS`, strings soltas como
`"ADMIN:permissions.view"` em `admin/permissions/profiles/route.ts:130`) contra a tabela
`permissions`. Se houver divergência, ela é reportada a você **antes** de mudar o resolver.

---

## 3. Casos de borda

1. **Code existe e ativo** → caminho inalterado.
2. **Code existe mas `status='inactive'` / soft-deletado** → hoje 403; passa a 500. É
   ambíguo: pode ser despublicação intencional. **Decisão registrada:** tratar como
   misconfig (500), porque despublicar uma permissão ainda referenciada por rota é um erro
   operacional. Se você preferir 403 aqui, o `getPermissionId` precisa distinguir os dois
   casos com uma segunda query — mais caro, e o resolver é caminho quente (ver #9).
3. **Super admin** → **não passa por este ramo** (`:253`). Continua entrando. Âncora
   preservada. A misconfig aparece nos logs pelos não-super.
4. **Erro de query em `permissions`** → já era 500; inalterado.
5. **Usuário sem link nenhum, code válido** → `allowedUnitIds` vazio → `hasPermission:false`
   → **403 legítimo**. Preservado. Esta é a distinção que o achado pede.

---

## 4. Teste

`getAccessibleUnitIdsForPermission` recebe `supabase` por parâmetro → testável com um duplo
encadeável em `tests/unit/`, sem rede. Casos:

- code ausente → **rejeita** com `PermissionAuthorizationError` status 500 e chama
  `options.logError` com stage `permission_code_not_found`;
- code válido + usuário sem grant → resolve com `hasPermission:false` (403 legítimo intacto);
- super admin → resolve sem tocar em `permissions` (assert de que a tabela não é consultada).

O primeiro caso falha no código atual (hoje resolve, não rejeita).

---

## 5. Critério de aceite

- [ ] lint / build / test:unit passam.
- [ ] Auditoria de codes (§2.2) executada e reportada **antes** do merge do fix.
- [ ] 403 legítimo (sem grant) continua 403.
- [ ] Super admin não regride.
- [ ] Diff em **um** arquivo de produção.

---

## 6. O que NÃO muda

- Ramo super admin (`:241-255`) — intocado.
- `hasNetworkScope` (`:265-267`, `:291-292`) — intocado.
- Estreitamento `active-unit` (`:288-295`) — intocado.
- `applyUserPermissionOverrides` / `resolveOverrideAccess` (precedência da fatia anterior) —
  intocados.
- Assinatura e formato de retorno de `getAccessibleUnitIdsForPermission` — inalterados no
  caminho de sucesso.
