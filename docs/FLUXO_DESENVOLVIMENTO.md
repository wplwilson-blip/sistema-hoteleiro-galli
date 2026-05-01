# Fluxo de Desenvolvimento

## Fluxo Padrão de Sprint

1. Criar branch por sprint.
2. Confirmar escopo fechado com o usuário.
3. Implementar apenas o que foi pedido.
4. Rodar `npm.cmd run lint`.
5. Rodar `npm.cmd run build`.
6. Rodar `git status --short --untracked-files=all`.
7. Testar localmente as rotas afetadas.
8. Se houver migration, aplicar manualmente no Supabase antes de testar.
9. Só fazer commit quando o prompt pedir explicitamente.
10. Só fazer push quando o prompt pedir explicitamente.
11. Abrir Pull Request para `main`.
12. Fazer merge.
13. Validar deploy da Vercel.
14. Fechar sprint.

## Regras para o Codex

- Não fazer commit sem autorização, exceto quando o prompt pedir COMMIT E PUSH.
- Não fazer push sem autorização.
- Não misturar sprints.
- Não criar migration sem necessidade clara.
- Não mexer em login/auth sem autorização explícita.
- Não alterar API fora do escopo.
- Não alterar banco fora do escopo.
- Sempre preservar multiunidade, auditoria, histórico e rastreabilidade.
- Em sprint de documentação, não alterar código.
- Em sprint de UI, não alterar regra de negócio.
- Em sprint de banco, documentar migration e orientar aplicação manual no Supabase.

## Validações Obrigatórias

Antes de entregar implementação funcional:

```powershell
npm.cmd run lint
npm.cmd run build
git status --short --untracked-files=all
```

Para sprint somente documentação:

```powershell
git status --short --untracked-files=all
```

## Git

- Preferir commits pequenos por sprint.
- Não commitar arquivos fora do escopo.
- Se houver alterações não relacionadas no working tree, avisar o usuário antes de commitar.
- Nunca usar `git reset --hard` sem autorização explícita.
- Nunca reverter alterações do usuário sem autorização.

## Migrations

- Criar migrations apenas quando necessário.
- Não aplicar automaticamente no Supabase remoto.
- Informar o nome da migration criada.
- Informar que precisa ser aplicada manualmente antes de testar.

## Produção

- Deploy é feito pela Vercel após merge na `main`.
- Validar produção após deploy.
- Não fechar sprint sem validar a rota principal afetada.
