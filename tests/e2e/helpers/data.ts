import { isValidCpf } from "@/lib/base-cadastros/schemas";

// Helpers de dados para a suite E2E.
//
// - Marcador `[E2E]` + sufixo unico por execucao para isolar/identificar dados de teste
//   (a limpeza aprovada e' soft-delete via app; ver doc 11 secao 8.2).
// - generateValidCpf: calcula os digitos verificadores pelo MESMO algoritmo do app e
//   AUTO-CONFERE o resultado com isValidCpf (a fonte de verdade em src/lib/base-cadastros/schemas).

export const E2E_MARKER = "[E2E]";

// Sufixo unico por execucao. Estavel dentro do mesmo processo de teste (modulo carregado uma vez),
// para as assercoes filtrarem exatamente os dados desta run.
const RUN_SUFFIX = (() => {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${ts}-${rand}`;
})();

/** Sufixo unico desta execucao (ex.: "lr3k9f-ab12"). */
export function runSuffix(): string {
  return RUN_SUFFIX;
}

/** Rotula um nome/titulo com o marcador `[E2E]` + sufixo da run. Ex.: "[E2E] Fornecedor lr3k9f-ab12". */
export function e2eLabel(base: string): string {
  return `${E2E_MARKER} ${base} ${RUN_SUFFIX}`;
}

// Mesmo calculo de digito verificador de isValidCpf (src/lib/base-cadastros/schemas.ts).
function cpfCheckDigit(digits: string, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += Number(digits[i]) * (length + 1 - i);
  }
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

/**
 * Gera um CPF VALIDO e deterministico a partir de um seed. Os 9 primeiros digitos
 * vem do seed; os 2 verificadores sao calculados pelo mesmo algoritmo do app.
 * O resultado e' conferido com isValidCpf antes de retornar (lanca se algo divergir).
 */
export function generateValidCpf(seed: number | string): string {
  const numericSeed = Math.abs(
    typeof seed === "number"
      ? Math.trunc(seed)
      : Array.from(String(seed)).reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7)
  );

  let base = (numericSeed % 1_000_000_000).toString().padStart(9, "0");

  // isValidCpf rejeita sequencias de 11 digitos iguais; evita a base que levaria a isso.
  if (/^(\d)\1{8}$/.test(base)) {
    base = `${(Number(base[0]) + 1) % 10}${base.slice(1)}`;
  }

  const d1 = cpfCheckDigit(base, 9);
  const d2 = cpfCheckDigit(`${base}${d1}`, 10);
  const cpf = `${base}${d1}${d2}`;

  if (!isValidCpf(cpf)) {
    throw new Error(`[e2e] generateValidCpf produziu CPF invalido para seed=${String(seed)}.`);
  }

  return cpf;
}

let cpfCounter = 0;

/** CPF valido e unico por chamada, ancorado no sufixo desta execucao. */
export function uniqueValidCpf(): string {
  return generateValidCpf(`${RUN_SUFFIX}-${cpfCounter++}`);
}
