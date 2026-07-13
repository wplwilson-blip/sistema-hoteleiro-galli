import { expect, test } from "@playwright/test";

import { resolveOverrideAccess, type PermissionOverrideRow } from "../../src/lib/auth/override-precedence";

// Runner puro (@playwright/test como test runner): sem browser, sem webServer.
// Nenhuma fixture `page`/`context` e' usada, entao nenhum navegador e' iniciado.
// Prova a precedencia deterministica de overrides (secao 3 do plano 45) e a
// invariancia de ordem (P0): embaralhar `overrides` nao pode mudar o resultado.

const g = (isAllowed: boolean): PermissionOverrideRow => ({ unit_id: null, is_allowed: isAllowed });
const u = (unitId: string, isAllowed: boolean): PermissionOverrideRow => ({ unit_id: unitId, is_allowed: isAllowed });

function sorted(set: ReadonlySet<string>): string[] {
  return Array.from(set).sort();
}

// Todas as permutacoes do array — prova invariancia de ordem de forma exaustiva
// (mais forte que apenas "original e revertido"), aproveitando arrays pequenos.
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const perm of permutations(rest)) {
      out.push([items[i], ...perm]);
    }
  }
  return out;
}

type Case = {
  name: string;
  linked: string[];
  base: string[];
  overrides: PermissionOverrideRow[];
  expected: string[];
};

// Matriz obrigatoria — secao 7 do plano.
const CASES: Case[] = [
  {
    name: "deny por-unidade sobrevive a allow global",
    linked: ["A", "B"],
    base: [],
    overrides: [g(true), u("B", false)],
    expected: ["A"]
  },
  {
    name: "allow por-unidade re-concede apos deny global",
    linked: ["A", "B"],
    base: [],
    overrides: [g(false), u("A", true)],
    expected: ["A"]
  },
  {
    name: "duplicados globais -> deny vence",
    linked: ["A", "B"],
    base: ["A"],
    overrides: [g(true), g(false)],
    expected: []
  },
  {
    name: "sem overrides -> inalterado",
    linked: ["A", "B"],
    base: ["A"],
    overrides: [],
    expected: ["A"]
  },
  {
    name: "deny por-unidade remove unidade do perfil",
    linked: ["A", "B"],
    base: ["A", "B"],
    overrides: [u("A", false)],
    expected: ["B"]
  },
  {
    name: "override de unidade nao vinculada e ignorado",
    linked: ["A"],
    base: ["A"],
    overrides: [u("C", true)],
    expected: ["A"]
  },
  {
    name: "allow e deny na mesma unidade -> deny vence",
    linked: ["A", "B"],
    base: ["A", "B"],
    overrides: [u("A", true), u("A", false)],
    expected: ["B"]
  }
];

for (const testCase of CASES) {
  test(`matriz: ${testCase.name}`, () => {
    const result = resolveOverrideAccess(new Set(testCase.base), new Set(testCase.linked), testCase.overrides);
    expect(sorted(result)).toEqual([...testCase.expected].sort());
  });

  test(`invariancia de ordem: ${testCase.name}`, () => {
    const expected = [...testCase.expected].sort();
    for (const perm of permutations(testCase.overrides)) {
      const result = resolveOverrideAccess(new Set(testCase.base), new Set(testCase.linked), perm);
      expect(sorted(result), `overrides na ordem ${JSON.stringify(perm)}`).toEqual(expected);
    }
  });
}
