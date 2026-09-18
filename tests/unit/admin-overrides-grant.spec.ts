import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

// Runner PURO (playwright.unit.config.ts: sem banco, sem browser).
//
// POR QUE ESTE TESTE EXISTE — achado da auditoria da Correcao 6.
//
// A rota PUT/DELETE /api/admin/permissions/overrides CONCEDE E REVOGA permissao para
// qualquer usuario. Ela e' gateada por `requirePermission("ADMIN:overrides.manage")` e
// mais nada: NAO ha' `context.isSuperAdmin` na rota, NAO ha' `assertUnitInPermissionScope`,
// e o `targetUserId` vem do corpo da requisicao sem nenhuma checagem de unidade.
//
// HOJE ISSO ESTA CERTO, e por um motivo que vive FORA da rota: a migration 070 concede
// `ADMIN:overrides.manage` a UM unico perfil, SUPER_ADMIN, que tem escopo global por
// desenho. A ausencia de escopo por unidade na rota e' coerente com isso.
//
// O QUE ESTE TESTE PROTEGE: a rota nao sabe disso. Se alguem conceder
// `ADMIN:overrides.manage` a um perfil nao-super-admin -- em migration nova, em ajuste
// manual no painel, ou por copiar a linha da matriz -- a rota passa a permitir que um
// usuario de UMA unidade conceda permissao a um usuario de OUTRA. Escalonamento de
// privilegio entre unidades, sem nada na rota para barrar, e sem erro nenhum.
//
// Mesmo padrao e mesma razao do teste `78.6 - allowlist FECHADA de rooms.occupancy`
// (tests/unit/room-state-three-dimensions.spec.ts), que ja' trava a matriz de apartamentos.
//
// LIMITE DECLARADO, e ele importa: este teste le o ARQUIVO da migration 070, nao o banco.
// Ele prova o que o repositorio DECLARA conceder. NAO prova o que esta' concedido em
// staging ou producao -- concessao feita direto no painel nao aparece aqui. A conferencia
// do banco e' de quem aplica. Mesma natureza do limite declarado no teste 5 da suite de
// apartamentos, que valida a tabela de referencia e nao o SQL executado.

const MIGRACAO_070 = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "070_admin_permissions_catalog.sql"
);

const PERMISSOES_ADMIN = [
  "ADMIN:permissions.view",
  "ADMIN:profiles.manage",
  "ADMIN:overrides.manage"
] as const;

function lerMigracao(): string {
  return readFileSync(MIGRACAO_070, "utf8");
}

/**
 * Extrai os pares (perfil, permissao) do bloco `profile_permission_matrix` da 070.
 *
 * Deliberadamente simples: casa `('PERFIL', 'MODULO:codigo')` dentro do arquivo inteiro.
 * Se a forma da matriz mudar, o teste passa a encontrar zero pares e o caso 2 quebra --
 * que e' o comportamento certo. Um extrator que "se adapta" silenciosamente a uma forma
 * nova deixaria de proteger exatamente quando o arquivo foi reescrito.
 */
function extrairConcessoes(sql: string): Array<{ perfil: string; permissao: string }> {
  const pares: Array<{ perfil: string; permissao: string }> = [];
  const regex = /\(\s*'([A-Z_]+)'\s*,\s*'(ADMIN:[a-z_.]+)'\s*\)/g;
  let achado: RegExpExecArray | null;

  while ((achado = regex.exec(sql)) !== null) {
    pares.push({ perfil: achado[1], permissao: achado[2] });
  }

  return pares;
}

test("6.1 - ADMIN:overrides.manage e' concedida SOMENTE a SUPER_ADMIN", () => {
  const concessoes = extrairConcessoes(lerMigracao());
  const perfisComOverrides = concessoes
    .filter((c) => c.permissao === "ADMIN:overrides.manage")
    .map((c) => c.perfil);

  // A permissao precisa estar concedida a alguem -- senao o teste passaria por vacuidade
  // num arquivo vazio ou renomeado.
  expect(perfisComOverrides.length).toBeGreaterThan(0);

  // E SO' a SUPER_ADMIN. Esta e' a linha que quebra se alguem alargar a concessao.
  expect(Array.from(new Set(perfisComOverrides))).toEqual(["SUPER_ADMIN"]);
});

test("6.2 - nenhuma permissao ADMIN vaza para perfil que nao seja SUPER_ADMIN", () => {
  const concessoes = extrairConcessoes(lerMigracao());

  expect(concessoes.length).toBeGreaterThan(0);

  // A allowlist e' FECHADA: qualquer perfil diferente de SUPER_ADMIN recebendo QUALQUER
  // permissao do modulo ADMIN e' um achado, nao so' `overrides.manage`. `profiles.manage`
  // tem o mesmo peso -- quem edita perfil edita permissao por tabela.
  const perfisIndevidos = concessoes.filter((c) => c.perfil !== "SUPER_ADMIN");

  expect(perfisIndevidos).toEqual([]);

  // Perfis operacionais nomeados, para o teste falhar com mensagem legivel se um deles
  // aparecer -- e nao so' com "array nao vazio".
  for (const perfil of [
    "DEPARTMENT_MANAGER",
    "SUPERVISOR",
    "LIDER_GOVERNANCA",
    "LIDER_MANUTENCAO",
    "RECEPCAO",
    "UNIT_DIRECTOR",
    "NETWORK_MANAGER",
    "AUDIT",
    "EMPLOYEE"
  ]) {
    expect(concessoes.map((c) => c.perfil)).not.toContain(perfil);
  }
});

test("6.3 - as tres permissoes ADMIN catalogadas continuam presentes", () => {
  const sql = lerMigracao();

  // Guarda contra o caso inverso: alguem REMOVER uma permissao do catalogo e o teste 6.1
  // passar a proteger um codigo que nao existe mais.
  for (const codigo of PERMISSOES_ADMIN) {
    expect(sql).toContain(codigo);
  }
});
