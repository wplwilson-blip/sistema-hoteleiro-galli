"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Minus, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorMessage, LoadingTable } from "@/components/base-cadastros/crud-components";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { canDo } from "@/lib/auth/permissions-ui";

// Fase 3-A (leitura) + Fase 3-B (edicao de excecoes por usuario).

type Tab = "perfis" | "usuarios";

// Permissoes de administracao protegidas contra auto-trancamento (espelha o backend).
const PROTECTED_ADMIN = ["ADMIN:permissions.view", "ADMIN:overrides.manage", "ADMIN:profiles.manage"];

type CatalogPermission = { code: string; moduleCode: string; actionCode: string; name: string; description: string };
type CatalogResponse = { ok: true; permissions: CatalogPermission[] };

type ProfilePermission = { code: string; moduleCode: string; actionCode: string; name: string; description: string };
type ProfileRecord = { id: string; code: string; name: string; description: string; isSystemDefault: boolean; permissions: ProfilePermission[] };
type ProfilesResponse = { ok: true; profiles: ProfileRecord[] };

type UserListItem = { id: string; username: string; displayName: string };
type UsersResponse = { ok: true; users: UserListItem[] };

type UserDetailResponse = {
  ok: true;
  user: { id: string; username: string; displayName: string };
  isSuperAdmin: boolean;
  permissions: string[];
  profiles: Array<{ code: string; name: string }>;
  profilePermissions: string[];
  overrides: Array<{ permissionCode: string; isAllowed: boolean }>;
};

const MODULE_LABELS: Record<string, string> = {
  ADMIN: "Administração",
  BASE: "Cadastros",
  PURCHASES: "Compras",
  HR: "RH",
  ATTACHMENTS: "Anexos"
};

function moduleLabel(code: string) {
  return MODULE_LABELS[code] ?? code;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message ?? "Não foi possível carregar os dados.");
  }
  return payload;
}

async function writeJson<T>(url: string, method: "PUT" | "DELETE", body: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message ?? "Não foi possível concluir a operação.");
  }
  return payload;
}

type ModuleGroup = { moduleCode: string; permissions: Array<{ code: string; name: string; description: string }> };

function groupByModule(permissions: Array<{ code: string; moduleCode: string; name: string; description: string }>): ModuleGroup[] {
  const map = new Map<string, Array<{ code: string; name: string; description: string }>>();
  for (const permission of permissions) {
    const list = map.get(permission.moduleCode) ?? [];
    list.push({ code: permission.code, name: permission.name, description: permission.description });
    map.set(permission.moduleCode, list);
  }
  return Array.from(map.entries())
    .map(([moduleCode, perms]) => ({
      moduleCode,
      permissions: perms.sort((a, b) => a.code.localeCompare(b.code, "pt-BR"))
    }))
    .sort((a, b) => moduleLabel(a.moduleCode).localeCompare(moduleLabel(b.moduleCode), "pt-BR"));
}

function ModulePermissionList({ groups }: { groups: ModuleGroup[] }) {
  if (!groups.length) {
    return <p className="text-sm text-muted-foreground">Nenhuma permissão concedida.</p>;
  }
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.moduleCode} className="rounded-md border bg-background p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{moduleLabel(group.moduleCode)}</p>
          <ul className="mt-2 space-y-1">
            {group.permissions.map((permission) => (
              <li key={permission.code} className="text-sm">
                <span className="font-medium text-foreground">{permission.name}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{permission.description || permission.code}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ProfilesTab() {
  const profilesQuery = useQuery({ queryKey: ["admin", "permissions", "profiles"], queryFn: () => fetchJson<ProfilesResponse>("/api/admin/permissions/profiles") });
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");

  const profiles = profilesQuery.data?.profiles ?? [];
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? null;
  const groups = useMemo(() => groupByModule(selectedProfile?.permissions ?? []), [selectedProfile]);

  if (profilesQuery.isLoading) return <LoadingTable label="Carregando perfis..." />;
  if (profilesQuery.error) return <ErrorMessage message={profilesQuery.error instanceof Error ? profilesQuery.error.message : "Erro ao carregar perfis."} />;
  if (!profiles.length) return <EmptyState title="Nenhum perfil de acesso" description="Não há perfis de acesso ativos para exibir." />;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]">
      <div className="space-y-1">
        {profiles.map((profile) => {
          const active = selectedProfile?.id === profile.id;
          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => setSelectedProfileId(profile.id)}
              className={cn(
                "flex w-full flex-col rounded-md border px-3 py-2 text-left transition-colors hover:border-primary/40",
                active ? "border-primary bg-primary/5" : "bg-card"
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                {profile.name}
                {profile.isSystemDefault ? (
                  <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium uppercase text-muted-foreground">Padrão do sistema</span>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">{profile.code}</span>
            </button>
          );
        })}
      </div>

      <div className="min-w-0 rounded-lg border bg-card p-4 shadow-sm shadow-primary/5">
        {selectedProfile ? (
          <>
            <div className="mb-3">
              <h3 className="text-base font-semibold text-foreground">{selectedProfile.name}</h3>
              {selectedProfile.description ? <p className="mt-1 text-sm text-muted-foreground">{selectedProfile.description}</p> : null}
            </div>
            <ModulePermissionList groups={groups} />
          </>
        ) : null}
      </div>
    </div>
  );
}

type OverrideState = "profile" | "granted-override" | "denied-override" | "none";
type ControlValue = "seguir" | "conceder" | "negar";
type PendingChange = { code: string; name: string; target: ControlValue };

const STATE_LABEL: Record<OverrideState, string> = {
  profile: "Herdada do perfil",
  "granted-override": "Concedida por exceção",
  "denied-override": "Negada por exceção",
  none: "Sem acesso"
};

function UsersTab() {
  const queryClient = useQueryClient();
  const myPermissions = useAppStore((state) => state.permissions);
  const myUserId = useAppStore((state) => state.user.id);
  const canEditOverrides = canDo(myPermissions, "ADMIN:overrides.manage");

  const usersQuery = useQuery({ queryKey: ["admin", "permissions", "users-picker"], queryFn: () => fetchJson<UsersResponse>("/api/base/users") });
  const catalogQuery = useQuery({ queryKey: ["admin", "permissions", "catalog"], queryFn: () => fetchJson<CatalogResponse>("/api/admin/permissions/catalog") });
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const userDetailQuery = useQuery({
    queryKey: ["admin", "permissions", "user", selectedUserId],
    queryFn: () => fetchJson<UserDetailResponse>(`/api/admin/permissions/user/${selectedUserId}`),
    enabled: Boolean(selectedUserId)
  });

  const mutation = useMutation({
    mutationFn: async (change: { code: string; target: ControlValue; reason: string }) => {
      if (change.target === "seguir") {
        return writeJson("/api/admin/permissions/overrides", "DELETE", { targetUserId: selectedUserId, permissionCode: change.code });
      }
      return writeJson("/api/admin/permissions/overrides", "PUT", {
        targetUserId: selectedUserId,
        permissionCode: change.code,
        isAllowed: change.target === "conceder",
        reason: change.reason || undefined
      });
    },
    onSuccess: async () => {
      setError("");
      setFeedback("Acesso atualizado com sucesso.");
      setPending(null);
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "permissions", "user", selectedUserId] });
    },
    onError: (mutationError) => {
      setFeedback("");
      setError(mutationError instanceof Error ? mutationError.message : "Não foi possível atualizar o acesso.");
    }
  });

  const users = usersQuery.data?.users ?? [];
  const catalog = useMemo(() => catalogQuery.data?.permissions ?? [], [catalogQuery.data?.permissions]);
  const detail = userDetailQuery.data;
  const isTotalAccess = Boolean(detail && (detail.isSuperAdmin || detail.permissions.includes("*")));

  const catalogByCode = useMemo(() => {
    const map = new Map<string, CatalogPermission>();
    for (const permission of catalog) map.set(permission.code, permission);
    return map;
  }, [catalog]);

  const overrideMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const override of detail?.overrides ?? []) map.set(override.permissionCode, override.isAllowed);
    return map;
  }, [detail?.overrides]);

  const profileSet = useMemo(() => new Set(detail?.profilePermissions ?? []), [detail?.profilePermissions]);

  function stateFor(code: string): OverrideState {
    if (overrideMap.has(code)) return overrideMap.get(code) ? "granted-override" : "denied-override";
    if (profileSet.has(code)) return "profile";
    return "none";
  }

  function controlValueFor(code: string): ControlValue {
    if (overrideMap.has(code)) return overrideMap.get(code) ? "conceder" : "negar";
    return "seguir";
  }

  // Read-only (aba efetiva) para quem NAO edita: mesmo comportamento da 3-A.
  const readonlyGroups = useMemo(() => {
    if (!detail || isTotalAccess) return [];
    const enriched = detail.permissions.map((code) => {
      const fromCatalog = catalogByCode.get(code);
      return {
        code,
        moduleCode: fromCatalog?.moduleCode ?? code.split(":")[0] ?? "OUTROS",
        name: fromCatalog?.name ?? code,
        description: fromCatalog?.description ?? ""
      };
    });
    return groupByModule(enriched);
  }, [catalogByCode, detail, isTotalAccess]);

  const catalogGroups = useMemo(() => groupByModule(catalog), [catalog]);

  function requestChange(code: string, name: string, target: ControlValue) {
    setError("");
    setFeedback("");
    setReason("");
    setPending({ code, name, target });
  }

  const loadingDetail = Boolean(selectedUserId) && userDetailQuery.isLoading;

  return (
    <div className="space-y-4">
      <div className="max-w-md space-y-1">
        <label htmlFor="admin-user-select" className="text-sm font-medium text-foreground">Usuário</label>
        {usersQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando usuários...</p>
        ) : usersQuery.error ? (
          <ErrorMessage message={usersQuery.error instanceof Error ? usersQuery.error.message : "Erro ao carregar usuários."} />
        ) : (
          <select
            id="admin-user-select"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={selectedUserId}
            onChange={(event) => {
              setSelectedUserId(event.target.value);
              setError("");
              setFeedback("");
            }}
          >
            <option value="">Selecione um usuário</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName || user.username} ({user.username})
              </option>
            ))}
          </select>
        )}
      </div>

      {feedback ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{feedback}</p> : null}
      {error ? <ErrorMessage message={error} /> : null}

      {!selectedUserId ? (
        <EmptyState title="Selecione um usuário" description="Escolha um usuário para ver e ajustar suas permissões efetivas (perfil + exceções)." />
      ) : loadingDetail ? (
        <LoadingTable label="Carregando permissões do usuário..." />
      ) : userDetailQuery.error ? (
        <ErrorMessage message={userDetailQuery.error instanceof Error ? userDetailQuery.error.message : "Erro ao carregar permissões."} />
      ) : detail ? (
        <div className="rounded-lg border bg-card p-4 shadow-sm shadow-primary/5">
          <div className="mb-3">
            <h3 className="text-base font-semibold text-foreground">{detail.user.displayName || detail.user.username}</h3>
            <p className="text-xs text-muted-foreground">
              @{detail.user.username}
              {detail.profiles.length ? ` • ${detail.profiles.map((profile) => profile.name).join(", ")}` : ""}
            </p>
          </div>

          {isTotalAccess ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <ShieldCheck className="h-4 w-4" />
              Acesso total (super admin) — todas as permissões do sistema.
            </div>
          ) : canEditOverrides ? (
            <div className="space-y-4">
              {catalogGroups.map((group) => (
                <div key={group.moduleCode} className="rounded-md border bg-background p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{moduleLabel(group.moduleCode)}</p>
                  <ul className="mt-2 divide-y">
                    {group.permissions.map((permission) => {
                      const state = stateFor(permission.code);
                      const current = controlValueFor(permission.code);
                      // Indicador visual de acesso EFETIVO (tem/nao tem) — leitura rapida; nao substitui STATE_LABEL (origem).
                      const hasAccess = state === "profile" || state === "granted-override";
                      const isSelfProtected = selectedUserId === myUserId && PROTECTED_ADMIN.includes(permission.code);
                      const options: Array<{ value: ControlValue; label: string; disabled?: boolean }> = [
                        { value: "seguir", label: "Seguir perfil", disabled: isSelfProtected },
                        { value: "conceder", label: "Conceder" },
                        { value: "negar", label: "Negar", disabled: isSelfProtected }
                      ];
                      return (
                        <li
                          key={permission.code}
                          className={cn(
                            "flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between",
                            hasAccess && "-mx-2 rounded-md border-l-2 border-emerald-500 bg-emerald-500/5 px-2"
                          )}
                        >
                          <div className="flex min-w-0 items-start gap-2">
                            <span
                              className={cn(
                                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                                hasAccess ? "bg-emerald-500/15 text-emerald-600" : "text-muted-foreground/40"
                              )}
                              aria-hidden="true"
                            >
                              {hasAccess ? <Check className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground">{permission.name}</p>
                              <p className="text-xs text-muted-foreground">{permission.description || permission.code} · <span className="italic">{STATE_LABEL[state]}</span></p>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-1">
                            {options.map((option) => (
                              <Button
                                key={option.value}
                                type="button"
                                size="sm"
                                variant={current === option.value ? "default" : "outline"}
                                disabled={mutation.isPending || Boolean(option.disabled)}
                                onClick={() => (current === option.value ? undefined : requestChange(permission.code, permission.name, option.value))}
                              >
                                {option.label}
                              </Button>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <ModulePermissionList groups={readonlyGroups} />
          )}
        </div>
      ) : null}

      {pending ? (
        <div className="fixed inset-0 z-[70] bg-black/50 px-4 py-6 backdrop-blur-sm" role="presentation" onClick={() => (mutation.isPending ? undefined : setPending(null))}>
          <div className="mx-auto flex min-h-full w-full max-w-md items-center justify-center">
            <div role="dialog" aria-modal="true" className="w-full rounded-lg border bg-card p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <h3 className="text-lg font-semibold text-foreground">
                {pending.target === "seguir" ? "Seguir o perfil" : pending.target === "conceder" ? "Conceder acesso" : "Negar acesso"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {pending.target === "seguir"
                  ? "Remover a exceção e voltar a seguir o perfil para "
                  : pending.target === "conceder"
                    ? "Conceder por exceção a permissão "
                    : "Negar por exceção a permissão "}
                <span className="font-medium text-foreground">{pending.name}</span>?
              </p>

              {pending.target !== "seguir" ? (
                <div className="mt-3 space-y-1">
                  <label htmlFor="override-reason" className="text-sm font-medium text-foreground">Justificativa (opcional)</label>
                  <textarea
                    id="override-reason"
                    rows={3}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Motivo da exceção (opcional)"
                  />
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPending(null)} disabled={mutation.isPending}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant={pending.target === "negar" ? "danger" : "default"}
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ code: pending.code, target: pending.target, reason })}
                >
                  {pending.target === "negar" ? <Ban className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  Confirmar
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PerfisAcessosClient() {
  const [tab, setTab] = useState<Tab>("perfis");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Perfis e Acessos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Visualização dos perfis de acesso e das permissões efetivas dos usuários, com edição de exceções por usuário.</p>
      </div>

      <div className="flex gap-1.5">
        <Button type="button" variant={tab === "perfis" ? "default" : "outline"} size="sm" onClick={() => setTab("perfis")}>
          <ShieldCheck className="h-4 w-4" />
          Perfis
        </Button>
        <Button type="button" variant={tab === "usuarios" ? "default" : "outline"} size="sm" onClick={() => setTab("usuarios")}>
          <Users className="h-4 w-4" />
          Usuários
        </Button>
      </div>

      {tab === "perfis" ? <ProfilesTab /> : <UsersTab />}
    </div>
  );
}
