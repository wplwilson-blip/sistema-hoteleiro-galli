import "server-only";

import { cookies } from "next/headers";

// Cookie de unidade ativa (preferencia de UI validada server-side).
// httpOnly: o cliente nao precisa ler; o servidor resolve a unidade ativa e a
// devolve no SessionContext. Flags espelham o padrao de cookies de server.ts.
export const ACTIVE_UNIT_COOKIE = "active_unit_id";

const activeUnitCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7
};

export function getActiveUnitCookie(): string | undefined {
  return cookies().get(ACTIVE_UNIT_COOKIE)?.value ?? undefined;
}

export function setActiveUnitCookie(unitId: string) {
  cookies().set(ACTIVE_UNIT_COOKIE, unitId, activeUnitCookieOptions);
}

export function clearActiveUnitCookie() {
  cookies().delete(ACTIVE_UNIT_COOKIE);
}
