"use client";

import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/base-cadastros/crud-components";

type ChangePasswordFormProps = {
  /** true = troca obrigatoria (1o acesso ou apos reset do admin): sem botao de cancelar. */
  forced?: boolean;
  onDone: () => void;
  onCancel?: () => void;
};

const MIN_LENGTH = 8;

/**
 * Tela de troca da propria senha (#C7, plano docs/codex/65).
 *
 * Serve aos DOIS caminhos: o voluntario (item do cabecalho) e o forcado (senha temporaria
 * definida pelo admin, ainda nao trocada). A diferenca e' so' a moldura: no forcado nao ha'
 * como sair da tela.
 *
 * A confirmacao ("repetir a nova senha") e' validada SO' aqui: e' protecao contra erro de
 * digitacao, nao regra de negocio -- o servidor nao precisa dela e nao a recebe.
 */
export function ChangePasswordForm({ forced = false, onDone, onCancel }: ChangePasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword.length < MIN_LENGTH) {
      setError(`A nova senha deve ter pelo menos ${MIN_LENGTH} caracteres.`);
      return;
    }

    if (newPassword === currentPassword) {
      setError("A nova senha deve ser diferente da atual.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("A confirmacao nao confere com a nova senha.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Sem id de usuario: o alvo vem da sessao, no servidor.
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        setError(payload?.message ?? "Nao foi possivel trocar a senha.");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onDone();
    } catch {
      setError("Nao foi possivel trocar a senha agora.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
          <KeyRound className="h-5 w-5" />
        </span>
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{forced ? "Defina uma nova senha" : "Trocar senha"}</h2>
          <p className="text-sm text-muted-foreground">
            {forced
              ? "Sua senha atual foi definida por um administrador e e temporaria. Escolha uma senha que so voce conheca para continuar."
              : "Informe a senha atual e escolha uma nova."}
          </p>
        </div>
      </div>

      <Field label="Senha atual">
        <TextInput
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          disabled={isSaving}
          onChange={(event) => {
            setCurrentPassword(event.target.value);
            setError("");
          }}
          data-testid="senha-atual"
        />
      </Field>

      <Field label="Nova senha">
        <TextInput
          type="password"
          autoComplete="new-password"
          value={newPassword}
          disabled={isSaving}
          onChange={(event) => {
            setNewPassword(event.target.value);
            setError("");
          }}
          data-testid="senha-nova"
        />
      </Field>

      <Field label="Confirmar nova senha">
        <TextInput
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          disabled={isSaving}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            setError("");
          }}
          data-testid="senha-confirmar"
        />
      </Field>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap justify-end gap-2">
        {!forced && onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={isSaving} data-testid="senha-salvar">
          {isSaving ? "Salvando..." : "Trocar senha"}
        </Button>
      </div>
    </form>
  );
}
