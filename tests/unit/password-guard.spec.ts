import { expect, test } from "@playwright/test";

import {
  PASSWORD_CHANGE_REQUIRED_MESSAGE,
  isPasswordChangeRequired
} from "../../src/lib/auth/password-guard";

// Runner puro. Cobre a fatia #5 (plano docs/codex/67): trava server-side de senha
// temporaria.
//
// O C7 entregou um gate de RENDERIZACAO -- com a flag armada o app nao e' montado, mas a
// sessao segue valida e quem chamasse a API direto continuava sendo atendido. Este
// predicado alimenta a trava no afunil de autenticacao, por onde passam 128 das 136 rotas.
//
// A ligacao entre o predicado e o 403 real depende de sessao e banco: esta' no roteiro de
// staging da secao 5 do plano, mesma limitacao aceita no C7.

// Sessao realista, para o teste nao provar apenas sobre um objeto de uma chave so'.
function session(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: "user-ana", name: "Ana", username: "ana.silva" },
    profile: { id: "profile-1", name: "Gerente", code: "MANAGER" },
    units: [{ id: "unit-1", name: "Unidade 1", code: "U1" }],
    activeUnit: { id: "unit-1", name: "Unidade 1", code: "U1" },
    permissions: ["PURCHASES:quotes.manage"],
    mustChangePassword: false,
    ...overrides
  };
}

test("flag true -> bloqueia", () => {
  expect(isPasswordChangeRequired(session({ mustChangePassword: true }))).toBe(true);
});

test("flag false -> passa", () => {
  expect(isPasswordChangeRequired(session({ mustChangePassword: false }))).toBe(false);
});

test("campo ausente -> passa (nao inventa bloqueio)", () => {
  // Cenario real: sessao montada por um caminho que ainda nao carrega a flag. O padrao
  // seguro aqui e' NAO bloquear -- travar o sistema inteiro por um campo ausente seria
  // pior que a falha que a fatia corrige.
  const semFlag = session();
  delete (semFlag as Record<string, unknown>).mustChangePassword;

  expect(isPasswordChangeRequired(semFlag)).toBe(false);
});

test("sessao nula/undefined -> passa (quem responde e' o 401, nao esta trava)", () => {
  // Misturar os dois faria uma requisicao SEM sessao responder "troque sua senha", que nao
  // ajuda ninguem e esconde o motivo real (nao esta' logado).
  expect(isPasswordChangeRequired(null)).toBe(false);
  expect(isPasswordChangeRequired(undefined)).toBe(false);
});

test("valores nulos/indefinidos na flag -> passa", () => {
  expect(isPasswordChangeRequired({ mustChangePassword: null })).toBe(false);
  expect(isPasswordChangeRequired({ mustChangePassword: undefined })).toBe(false);
  expect(isPasswordChangeRequired({})).toBe(false);
});

test("a mensagem da trava diz o que fazer, e nao apenas que foi negado", () => {
  // O usuario travado precisa saber qual e' a saida; um "acesso negado" seco geraria
  // chamado de suporte e a impressao de que o sistema quebrou.
  const texto = PASSWORD_CHANGE_REQUIRED_MESSAGE.toLowerCase();

  expect(texto).toContain("senha");
  expect(texto).toContain("troque");
});
