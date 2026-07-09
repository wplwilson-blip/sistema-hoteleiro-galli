// Formatadores puros compartilhados. Antes de adicionar uma nova variante de data,
// verifique se uma das funções abaixo já reproduz o comportamento desejado.

/** Data (sem hora). T-aware: string com "T" usa fuso local; "YYYY-MM-DD" é fixada em UTC. Vazio/NaN → "-". Uso padrão. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", value.includes("T") ? undefined : { timeZone: "UTC" });
}

/** Data (sem hora), sempre interpretada como "YYYY-MM-DD" em UTC (ignora hora). Vazio/NaN → "-". */
export function formatDateOnlyUtc(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/** Data (sem hora) no fuso local do navegador, formato pt-BR default. Vazio/NaN → "-". */
export function formatDateLocal(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

/** Igual a formatDateLocal, mas via Intl.DateTimeFormat explícito (day/month/year numeric). Vazio/NaN → "-". */
export function formatDateLocalIntl(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

/** Data (sem hora) no fuso local, SEM guarda de NaN (data inválida → "Invalid Date"). Vazio → "-". Preservado 1:1 do dashboard de documentação. */
export function formatDateLocalNoGuard(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

/** Data (sem hora) em UTC, SEM guarda de NaN (data inválida → "Invalid Date"). Vazio → "-". Preservado 1:1 do dashboard de documentação. */
export function formatDateOnlyUtcNoGuard(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/** Data (sem hora) para Compras: fallback "Não informado" (não "-"), normaliza "YYYY-MM-DD" em fuso local. */
export function formatDateWithFallbackNaoInformado(value: string | null | undefined): string {
  if (!value) return "Não informado";
  const normalized = value.length === 10 ? `${value}T00:00:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

/** Data (sem hora) com ano de 2 dígitos: "YYYY-MM-DD" vira DD/MM/YYYY literal; caso contrário fuso local, year 2-digit. Vazio/NaN → "-". */
export function formatDateShortYearFlexible(value: string | null | undefined): string {
  if (!value) return "-";
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) return `${dateOnlyMatch[3]}/${dateOnlyMatch[2]}/${dateOnlyMatch[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Data e hora no fuso local, ano completo (2025). Vazio/NaN → "-". Uso padrão para timestamps. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

/** Data e hora no fuso local, ano de 2 dígitos (25). Vazio/NaN → "-". Usado em listas/dashboards compactos. */
export function formatDateTimeShortYear(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Valor monetário em Real (BRL), locale pt-BR. */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

/** Tamanho de arquivo legível: MB (1 casa, vírgula), KB (arredonda p/ cima) ou bytes. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

/** Converte string localizada (pt-BR, vírgula decimal) em number; inválido/vazio → 0. */
export function parseLocalizedNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
