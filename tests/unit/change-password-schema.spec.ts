import { expect, test } from "@playwright/test";

import { changePasswordPayloadSchema } from "../../src/lib/base-cadastros/schemas";

// Runner puro. Cobre o achado #C7 (plano docs/codex/65): troca da propria senha.
//
// Este e' o unico pedaco PURO da fatia -- o resto e' I/O contra o Supabase Auth (verificar
// a senha atual, trocar, limpar a flag) e esta' no roteiro de staging da secao 5 do plano.

const SENHA_ATUAL = "senha-atual-123";
const SENHA_NOVA = "senha-nova-4567";

function payload(overrides: Record<string, unknown> = {}) {
  return { currentPassword: SENHA_ATUAL, newPassword: SENHA_NOVA, ...overrides };
}

function firstIssue(result: ReturnType<typeof changePasswordPayloadSchema.safeParse>) {
  return result.success ? null : { path: String(result.error.issues[0]?.path[0] ?? ""), message: result.error.issues[0]?.message ?? "" };
}

test("payload valido passa", () => {
  const result = changePasswordPayloadSchema.safeParse(payload());

  expect(result.success).toBe(true);
});

test("a nova senha NAO pode ser igual a atual", () => {
  // Sem esta regra, "trocar a senha" poderia nao trocar nada -- e a flag
  // must_change_password seria limpa mesmo assim, deixando valendo a senha que o admin
  // conhece. E' exatamente o que a fatia existe para impedir.
  const result = changePasswordPayloadSchema.safeParse(payload({ newPassword: SENHA_ATUAL }));

  expect(result.success).toBe(false);
  expect(firstIssue(result)?.path).toBe("newPassword");
  expect(firstIssue(result)?.message).toContain("diferente da atual");
});

test("a nova senha exige no minimo 8 caracteres", () => {
  const result = changePasswordPayloadSchema.safeParse(payload({ newPassword: "1234567" }));

  expect(result.success).toBe(false);
  expect(firstIssue(result)?.path).toBe("newPassword");

  // 8 exatos passam (o limite e' inclusivo).
  expect(changePasswordPayloadSchema.safeParse(payload({ newPassword: "12345678" })).success).toBe(true);
});

test("a senha atual tambem exige no minimo 8 caracteres", () => {
  const result = changePasswordPayloadSchema.safeParse(payload({ currentPassword: "curta" }));

  expect(result.success).toBe(false);
  expect(firstIssue(result)?.path).toBe("currentPassword");
});

test("campos ausentes sao rejeitados", () => {
  expect(changePasswordPayloadSchema.safeParse({ newPassword: SENHA_NOVA }).success).toBe(false);
  expect(changePasswordPayloadSchema.safeParse({ currentPassword: SENHA_ATUAL }).success).toBe(false);
  expect(changePasswordPayloadSchema.safeParse({}).success).toBe(false);
});

test("nao ha' campo de usuario no payload — o alvo vem SEMPRE da sessao", () => {
  // Guarda de desenho, nao de valor: se alguem adicionar um id/username aqui, a rota passa
  // a ter um parametro manipulavel e vira "trocar a senha de qualquer um".
  const result = changePasswordPayloadSchema.safeParse({
    ...payload(),
    userId: "11111111-1111-4111-8111-111111111111",
    username: "outra.pessoa"
  });

  expect(result.success).toBe(true);

  if (result.success) {
    expect(Object.keys(result.data).sort()).toEqual(["currentPassword", "newPassword"]);
  }
});

test("espacos nao sao aparados — senha e' literal", () => {
  // Aparar espacos mudaria a senha que o usuario escolheu. `  abcdefgh  ` tem 12
  // caracteres e e' valida; o Auth guarda exatamente isso.
  const comEspacos = "  abcdefgh  ";
  const result = changePasswordPayloadSchema.safeParse(payload({ newPassword: comEspacos }));

  expect(result.success).toBe(true);

  if (result.success) {
    expect(result.data.newPassword).toBe(comEspacos);
  }
});
