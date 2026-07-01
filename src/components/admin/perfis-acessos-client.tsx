"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorMessage, LoadingTable } from "@/components/base-cadastros/crud-components";
import { cn } from "@/lib/utils";

// Fase 3-A: tela READ-ONLY de Perfis e Acessos. So consome GETs; nao escreve nada.

type Tab = "perfis" | "usuarios";

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

function UsersTab() {
  const usersQuery = useQuery({ queryKey: ["admin", "permissions", "users-picker"], queryFn: () => fetchJson<UsersResponse>("/api/base/users") });
  const catalogQuery = useQuery({ queryKey: ["admin", "permissions", "catalog"], queryFn: () => fetchJson<CatalogResponse>("/api/admin/permissions/catalog") });
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const userDetailQuery = useQuery({
    queryKey: ["admin", "permissions", "user", selectedUserId],
    queryFn: () => fetchJson<UserDetailResponse>(`/api/admin/permissions/user/${selectedUserId}`),
    enabled: Boolean(selectedUserId)
  });

  const users = usersQuery.data?.users ?? [];
  const catalogByCode = useMemo(() => {
    const map = new Map<string, CatalogPermission>();
    for (const permission of catalogQuery.data?.permissions ?? []) map.set(permission.code, permission);
    return map;
  }, [catalogQuery.data?.permissions]);

  const detail = userDetailQuery.data;
  const isTotalAccess = Boolean(detail && (detail.isSuperAdmin || detail.permissions.includes("*")));
  const groups = useMemo(() => {
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
            onChange={(event) => setSelectedUserId(event.target.value)}
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

      {!selectedUserId ? (
        <EmptyState title="Selecione um usuário" description="Escolha um usuário para ver suas permissões efetivas (perfil + exceções)." />
      ) : userDetailQuery.isLoading ? (
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
          ) : (
            <ModulePermissionList groups={groups} />
          )}
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
        <p className="mt-1 text-sm text-muted-foreground">Visualização (somente leitura) dos perfis de acesso e das permissões efetivas dos usuários.</p>
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
