"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import {
  ErrorMessage,
  Field,
  FormActions,
  FormCard,
  LoadingTable,
  NewRecordButton,
  RowActions,
  SelectField,
  TextInput
} from "@/components/base-cadastros/crud-components";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

type AccessStatus = "active" | "inactive" | "blocked" | "pending";

type UserRecord = {
  id: string;
  username: string;
  displayName: string;
  employeeId: string;
  employeeName: string;
  accessProfileId: string;
  accessProfileName: string;
  accessProfileCode: string;
  unitIds: string[];
  unitNames: string[];
  status: AccessStatus;
  createdAt: string;
};

type EmployeeOption = {
  id: string;
  name: string;
};

type ProfileOption = {
  id: string;
  code: string;
  name: string;
};

type UnitOption = {
  id: string;
  code: string;
  name: string;
};

type UsersResponse = {
  ok: true;
  users: UserRecord[];
  employees: EmployeeOption[];
  profiles: ProfileOption[];
  units: UnitOption[];
};

type UserForm = {
  employeeId: string;
  username: string;
  password: string;
  accessProfileId: string;
  unitIds: string[];
  status: AccessStatus;
};

const emptyForm: UserForm = {
  employeeId: "",
  username: "",
  password: "",
  accessProfileId: "",
  unitIds: [],
  status: "active"
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.message ?? "Não foi possível concluir a operação.");
  }

  return payload;
}

function accessStatusLabel(status: AccessStatus) {
  const labels = {
    active: "Ativo",
    inactive: "Inativo",
    blocked: "Bloqueado",
    pending: "Pendente"
  };

  return labels[status];
}

function accessProfileLabel(code: string, fallbackName: string) {
  const labels: Record<string, string> = {
    SUPER_ADMIN: "Administrador Geral",
    NETWORK_MANAGER: "Gestor da Rede",
    UNIT_DIRECTOR: "Diretor da Unidade",
    DEPARTMENT_MANAGER: "Gerente Departamental",
    SUPERVISOR: "Supervisor",
    FINANCE: "Financeiro",
    AUDIT: "Auditoria",
    EMPLOYEE: "Colaborador",
    EXTERNAL_TECHNICIAN: "Técnico Externo"
  };

  return labels[code] ?? fallbackName;
}

function AccessStatusBadge({ status }: { status: AccessStatus }) {
  if (status === "active") {
    return <StatusBadge status="success" label={accessStatusLabel(status)} />;
  }

  if (status === "blocked") {
    return <StatusBadge status="danger" label={accessStatusLabel(status)} />;
  }

  return <StatusBadge status="visual" label={accessStatusLabel(status)} />;
}

export function UsersClient() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetDone, setResetDone] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const usersQuery = useQuery({
    queryKey: ["base", "users"],
    queryFn: async () => requestJson<UsersResponse>("/api/base/users")
  });

  const saveMutation = useMutation({
    mutationFn: async (override?: { id?: string; payload: UserForm }) => {
      const payload = override?.payload ?? form;
      const targetId = override?.id ?? editing?.id;
      const url = targetId ? `/api/base/users/${targetId}` : "/api/base/users";
      const method = targetId ? "PATCH" : "POST";
      const body = targetId
        ? {
            employeeId: payload.employeeId,
            accessProfileId: payload.accessProfileId,
            unitIds: payload.unitIds,
            status: payload.status
          }
        : payload;

      return requestJson(url, { method, body: JSON.stringify(body) });
    },
    onSuccess: async () => {
      setError("");
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["base", "users"] });
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Não foi possível salvar o usuário.")
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      if (!editing) {
        throw new Error("Selecione um usuário para redefinir a senha.");
      }

      return requestJson(`/api/base/users/${editing.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password: resetPassword })
      });
    },
    onSuccess: () => {
      setResetError("");
      setResetDone(true);
      setResetPassword("");
    },
    onError: (mutationError) => {
      setResetDone(false);
      setResetError(mutationError instanceof Error ? mutationError.message : "Não foi possível redefinir a senha.");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (user: UserRecord) => requestJson(`/api/base/users/${user.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setDeleteError("");
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["base", "users"] });
    },
    onError: (mutationError) => setDeleteError(mutationError instanceof Error ? mutationError.message : "Não foi possível excluir o usuário.")
  });

  function openNew() {
    const data = usersQuery.data;

    setEditing(null);
    setForm({
      ...emptyForm,
      employeeId: data?.employees[0]?.id ?? "",
      accessProfileId: data?.profiles[0]?.id ?? "",
      unitIds: data?.units[0]?.id ? [data.units[0].id] : []
    });
    setError("");
    setResetPassword("");
    setResetError("");
    setResetDone(false);
    setFormOpen(true);
  }

  function openEdit(user: UserRecord) {
    setEditing(user);
    setForm({
      employeeId: user.employeeId,
      username: user.username,
      password: "",
      accessProfileId: user.accessProfileId,
      unitIds: user.unitIds,
      status: user.status
    });
    setError("");
    setResetPassword("");
    setResetError("");
    setResetDone(false);
    setFormOpen(true);
  }

  function toggleStatus(user: UserRecord) {
    const nextStatus: AccessStatus = user.status === "active" ? "inactive" : "active";

    saveMutation.mutate({
      id: user.id,
      payload: {
        employeeId: user.employeeId,
        username: user.username,
        password: "",
        accessProfileId: user.accessProfileId,
        unitIds: user.unitIds,
        status: nextStatus
      }
    });
  }

  function toggleUnit(unitId: string) {
    const unitIds = form.unitIds.includes(unitId) ? form.unitIds.filter((id) => id !== unitId) : [...form.unitIds, unitId];

    setForm({ ...form, unitIds });
  }

  const users = useMemo(() => usersQuery.data?.users ?? [], [usersQuery.data?.users]);
  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return users;
    }

    return users.filter((user) =>
      [user.username, user.employeeName, accessProfileLabel(user.accessProfileCode, user.accessProfileName), ...user.unitNames]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term))
    );
  }, [search, users]);

  const employees = usersQuery.data?.employees ?? [];
  const profiles = usersQuery.data?.profiles ?? [];
  const units = usersQuery.data?.units ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TextInput
          className="sm:max-w-md"
          placeholder="Buscar por usuário, colaborador, perfil ou unidade"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <NewRecordButton label="Novo usuário" onClick={openNew} />
      </div>

      {formOpen ? (
        <FormCard title={editing ? "Editar usuário" : "Novo usuário"} onCancel={() => setFormOpen(false)}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(undefined);
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Colaborador">
                <SelectField value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}>
                  <option value="">Selecione</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Perfil de acesso">
                <SelectField value={form.accessProfileId} onChange={(event) => setForm({ ...form, accessProfileId: event.target.value })}>
                  <option value="">Selecione</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {accessProfileLabel(profile.code, profile.name)}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Username">
                <TextInput
                  value={form.username}
                  disabled={Boolean(editing)}
                  required={!editing}
                  placeholder="nome.sobrenome"
                  onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase().trim() })}
                />
              </Field>
              <Field label="Senha inicial">
                <TextInput
                  type="password"
                  value={form.password}
                  disabled={Boolean(editing)}
                  required={!editing}
                  minLength={8}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
                {editing ? (
                  <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Redefinir senha</p>
                    <TextInput
                      type="password"
                      autoComplete="new-password"
                      placeholder="Nova senha (mínimo 8 caracteres)"
                      value={resetPassword}
                      minLength={8}
                      onChange={(event) => {
                        setResetPassword(event.target.value);
                        setResetError("");
                        setResetDone(false);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={resetPassword.length < 8 || resetPasswordMutation.isPending}
                      onClick={() => resetPasswordMutation.mutate()}
                    >
                      {resetPasswordMutation.isPending ? "Definindo..." : "Definir nova senha"}
                    </Button>
                    {resetError ? <p className="text-xs text-destructive">{resetError}</p> : null}
                    {resetDone ? <p className="text-xs text-emerald-600">Senha redefinida com sucesso.</p> : null}
                  </div>
                ) : null}
              </Field>
              <Field label="Status">
                <SelectField value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as AccessStatus })}>
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                  <option value="blocked">Bloqueado</option>
                  <option value="pending">Pendente</option>
                </SelectField>
              </Field>
            </div>

            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Unidades permitidas</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {units.map((unit) => (
                  <label key={unit.id} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                    <input type="checkbox" checked={form.unitIds.includes(unit.id)} onChange={() => toggleUnit(unit.id)} />
                    <span className="font-medium text-primary">{unit.code}</span>
                    <span className="truncate text-muted-foreground">{unit.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <ErrorMessage message={error} />
            <FormActions isSaving={saveMutation.isPending} onCancel={() => setFormOpen(false)} />
          </form>
        </FormCard>
      ) : null}

      {usersQuery.isLoading ? <LoadingTable /> : null}
      {usersQuery.error ? <ErrorMessage message={usersQuery.error instanceof Error ? usersQuery.error.message : "Erro ao carregar usuários."} /> : null}
      {!usersQuery.isLoading && !filteredUsers.length ? (
        <EmptyState title="Nenhum usuário encontrado" description="Crie usuários internos vinculados a colaboradores, perfis e unidades." />
      ) : null}
      {filteredUsers.length ? (
        <div className="max-w-full overflow-x-auto rounded-lg border bg-card shadow-sm shadow-primary/5">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Usuário</th>
                <th className="px-4 py-3 font-semibold">Colaborador</th>
                <th className="px-4 py-3 font-semibold">Perfil</th>
                <th className="px-4 py-3 font-semibold">Unidades</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-muted/35">
                  <td className="px-4 py-3 font-medium">@{user.username}</td>
                  <td className="px-4 py-3 text-muted-foreground">{user.employeeName || "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{user.accessProfileId ? accessProfileLabel(user.accessProfileCode, user.accessProfileName) : "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{user.unitNames.join(", ") || "-"}</td>
                  <td className="px-4 py-3">
                    <AccessStatusBadge status={user.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <RowActions
                        onEdit={() => openEdit(user)}
                        onInactivate={() => toggleStatus(user)}
                        disableInactivate={!user.employeeId || !user.accessProfileId || !user.unitIds.length || saveMutation.isPending}
                        inactivateLabel={user.status === "active" ? "Inativar" : "Ativar"}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setDeleteTarget(user);
                          setDeleteError("");
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-lg">
            <h2 className="text-lg font-semibold">Excluir usuário</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Tem certeza que deseja excluir{" "}
              <span className="font-medium text-foreground">@{deleteTarget.username}</span>? Esta ação remove o acesso do
              usuário (exclusão lógica) e ele deixará de aparecer na lista. O login fica bloqueado imediatamente.
            </p>
            {deleteError ? (
              <div className="mt-3">
                <ErrorMessage message={deleteError} />
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError("");
                }}
                disabled={deleteMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteMutation.mutate(deleteTarget)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
