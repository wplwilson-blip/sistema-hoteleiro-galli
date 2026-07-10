export type PermissionOverrideRow = { unit_id: string | null; is_allowed: boolean };

/**
 * Resolve o conjunto final de unidades acessíveis aplicando overrides sobre a base
 * derivada do perfil. Determinístico e independente da ordem das linhas.
 * Precedência: por-unidade > global > base; deny vence allow na mesma especificidade.
 */
export function resolveOverrideAccess(
  profileAllowedUnitIds: ReadonlySet<string>,
  linkedUnitIds: ReadonlySet<string>,
  overrides: ReadonlyArray<PermissionOverrideRow>
): Set<string> {
  const result = new Set(profileAllowedUnitIds);

  // 1) Global (unit_id ausente): deny vence allow. Ignora ordem.
  const globals = overrides.filter((o) => !o.unit_id);
  if (globals.some((o) => !o.is_allowed)) {
    result.clear();
  } else if (globals.some((o) => o.is_allowed)) {
    linkedUnitIds.forEach((unitId) => result.add(unitId));
  }

  // 2) Por-unidade (mais específico, vence global): só unidades vinculadas; deny vence allow.
  const denied = new Set<string>();
  const allowed = new Set<string>();
  for (const o of overrides) {
    if (!o.unit_id || !linkedUnitIds.has(o.unit_id)) continue;
    (o.is_allowed ? allowed : denied).add(o.unit_id);
  }
  allowed.forEach((unitId) => {
    if (!denied.has(unitId)) result.add(unitId);
  });
  denied.forEach((unitId) => result.delete(unitId));

  return result;
}
