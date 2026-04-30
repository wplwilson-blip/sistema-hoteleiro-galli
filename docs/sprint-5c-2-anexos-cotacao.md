# Sprint 5C.2 - Anexos de Cotacao

## Objetivo
Permitir anexar arquivos as cotacoes de compras antes da etapa de aprovacao da compra. Os anexos cobrem propostas em PDF, imagens, prints e documentos enviados pelos fornecedores.

## Tabela usada
A sprint usa a tabela generica `public.attachments`, criada na Sprint 2C, sem criar tabela especifica para cotacoes.

Vinculo usado:
- `module = 'purchases'`
- `entity_type = 'purchase_quote'`
- `entity_id = purchase_quotes.id`

## Bucket e storage
O bucket usado pela aplicacao e `attachments`.

O bucket deve ser privado. Nao foi criada migration para bucket ou policies de `storage.objects`, porque o projeto ainda nao possui padrao versionado de Storage policies. Antes de usar em ambiente real, criar manualmente no Supabase um bucket privado chamado `attachments`.

Caminho dos arquivos:

```text
purchases/{organization_id}/{unit_id}/purchase_quotes/{purchase_quote_id}/{timestamp}-{file_name}
```

Fallback quando `unit_id` for nulo:

```text
purchases/{organization_id}/global/purchase_quotes/{purchase_quote_id}/{timestamp}-{file_name}
```

## APIs criadas
- `GET /api/attachments`
- `POST /api/attachments`
- `DELETE /api/attachments/[id]`

As APIs sao genericas por nome, mas nesta sprint aceitam com seguranca apenas:
- `module = purchases`
- `entity_type = purchase_quote`

## Regras de seguranca
- Todas as rotas exigem usuario autenticado.
- O acesso ao anexo e validado pela cotacao informada.
- A API busca `purchase_quotes`, valida a `purchase_request` vinculada e confere se a unidade da solicitacao esta entre as unidades acessiveis ao usuario.
- A API nao aceita anexos para outros modulos ou outras entidades nesta sprint.
- A listagem retorna apenas anexos ativos e sem `deleted_at`.
- A remocao faz soft delete em banco com `status = inactive`, `deleted_at`, `deleted_by` e `updated_by`.

## Tipos permitidos
- PDF
- PNG
- JPG/JPEG
- WEBP
- DOC/DOCX
- XLS/XLSX

Arquivos perigosos como `exe`, `bat`, `cmd`, `js`, `sh`, `php` e `html` sao bloqueados.

## Limites
- Tamanho maximo por arquivo: 10 MB.

## Tela
Em `/compras/cotacoes`, cada cotacao cadastrada exibe uma secao `Anexos` com:
- envio de arquivo;
- descricao opcional;
- lista de anexos;
- nome do arquivo;
- tipo MIME;
- tamanho;
- data de envio;
- descricao;
- remocao logica do anexo.

Quando possivel, a API retorna URL assinada temporaria para abrir o arquivo do bucket privado.

## O que ficou fora
- Preview de arquivo.
- Versionamento de bucket/policies via migration.
- Remocao fisica do arquivo no Storage ao remover anexo.
- Anexos para `purchase_request` e `purchase_receipt`.
- Aprovacao final.
- Pedido de compra.
- Recebimento.
- Contas a pagar.
- Financeiro completo.
