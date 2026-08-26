import { expect, test } from "@playwright/test";

import {
  INVALID_LOGIN_MESSAGE,
  isCredentialFailure,
  resolveLoginFailureResponse,
  type LoginFailureReason
} from "../../src/lib/auth/login-response";

// Runner puro. Cobre o achado #4, fatia 1 (plano docs/codex/54): resposta uniforme no login.
//
// O QUE ESTES TESTES PROVAM: nenhum motivo anterior a' prova da senha distingue uma conta
// de outra. Antes desta fatia, "usuario inexistente" dava 401 e "usuario existente sem
// vinculo" dava 403 com mensagem propria -- os dois ANTES do signInWithPassword. Ou seja,
// sem conhecer senha nenhuma dava para enumerar contas validas.

const PRE_PASSWORD_REASONS: LoginFailureReason[] = [
  "user_not_found",
  "user_inactive",
  "user_lookup_failed",
  "invalid_password"
];

test("todos os motivos pre-senha colapsam em 401 com a MESMA mensagem", () => {
  // Este e' o teste do oraculo: se alguem devolver um status ou uma string diferente para
  // qualquer um destes motivos, a enumeracao de contas volta.
  const respostas = PRE_PASSWORD_REASONS.map((reason) => resolveLoginFailureResponse(reason));

  respostas.forEach((resposta, index) => {
    expect(resposta.status, PRE_PASSWORD_REASONS[index]).toBe(401);
    expect(resposta.message, PRE_PASSWORD_REASONS[index]).toBe(INVALID_LOGIN_MESSAGE);
  });

  // Redundante de proposito: prova que o conjunto de respostas distintas tem tamanho 1.
  const distintas = new Set(respostas.map((resposta) => `${resposta.status}|${resposta.message}`));
  expect(distintas.size, `respostas distintas: ${JSON.stringify(Array.from(distintas))}`).toBe(1);
});

test("os motivos pre-senha sao os unicos acolchoados (piso de tempo)", () => {
  // O piso existe para apagar a diferenca de custo entre pular a verificacao de senha e
  // faze-la. Os demais motivos ja' provaram a senha: o tempo deles nao informa nada.
  for (const reason of PRE_PASSWORD_REASONS) {
    expect(resolveLoginFailureResponse(reason).padded, reason).toBe(true);
    expect(isCredentialFailure(reason), reason).toBe(true);
  }

  for (const reason of ["no_active_unit", "no_session_context"] as LoginFailureReason[]) {
    expect(resolveLoginFailureResponse(reason).padded, reason).toBe(false);
    expect(isCredentialFailure(reason), reason).toBe(false);
  }
});

test("'sem vinculo ativo' continua sendo 403 informativo — so' que apos a senha", () => {
  // A correcao NAO e' esconder este 403. Ele segue existindo e segue dizendo o que fazer;
  // o que mudou e' que so' e' alcancavel por quem ja' provou ter a credencial.
  const resposta = resolveLoginFailureResponse("no_active_unit");

  expect(resposta.status).toBe(403);
  expect(resposta.message).toContain("administrador");
  expect(resposta.message).not.toBe(INVALID_LOGIN_MESSAGE);
});

test("'sem perfil de acesso' continua 403 com mensagem propria", () => {
  const resposta = resolveLoginFailureResponse("no_session_context");

  expect(resposta.status).toBe(403);
  expect(resposta.message).toContain("perfil de acesso");
});

test("os dois 403 sao distinguiveis entre si (ambos pos-senha, ambos podem informar)", () => {
  const semVinculo = resolveLoginFailureResponse("no_active_unit");
  const semPerfil = resolveLoginFailureResponse("no_session_context");

  expect(semVinculo.message).not.toBe(semPerfil.message);
});

test("a mensagem generica nao cita usuario, conta, cadastro nem vinculo", () => {
  // Guarda contra alguem "melhorar" a mensagem e reintroduzir a pista.
  const texto = INVALID_LOGIN_MESSAGE.toLowerCase();

  for (const palavra of ["nao existe", "inexistente", "inativo", "bloqueado", "vinculo", "cadastro"]) {
    expect(texto, palavra).not.toContain(palavra);
  }
});
