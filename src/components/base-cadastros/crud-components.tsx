"use client";

import { Edit2, Loader2, Plus, PowerOff, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/common/status-badge";
import { cn } from "@/lib/utils";

export type RecordStatus = "active" | "inactive" | "archived";

export function statusLabel(status: RecordStatus) {
  return status === "active" ? "Ativo" : status === "inactive" ? "Inativo" : "Arquivado";
}

export function RecordStatusBadge({ status }: { status: RecordStatus }) {
  return <StatusBadge status={status === "active" ? "success" : "visual"} label={statusLabel(status)} />;
}

export function ErrorMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{message}</p>;
}

export function LoadingTable({ label = "Carregando dados..." }: { label?: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
      {label}
    </div>
  );
}

export function FormCard({
  title,
  children,
  onCancel
}: {
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
}) {
  return (
    <Card className="border-border/80 shadow-sm shadow-primary/5">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg">{title}</CardTitle>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-4 w-4" />
          Fechar
        </Button>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        props.className
      )}
    />
  );
}

export function SelectField(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        props.className
      )}
    />
  );
}

export function FormActions({
  isSaving,
  onCancel,
  submitLabel = "Salvar"
}: {
  isSaving: boolean;
  onCancel: () => void;
  submitLabel?: string;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" disabled={isSaving}>
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {submitLabel}
      </Button>
    </div>
  );
}

export function NewRecordButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button onClick={onClick}>
      <Plus className="h-4 w-4" />
      {label}
    </Button>
  );
}

export function RowActions({
  onEdit,
  onInactivate,
  disableInactivate
}: {
  onEdit: () => void;
  onInactivate: () => void;
  disableInactivate?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onEdit}>
        <Edit2 className="h-4 w-4" />
        Editar
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onInactivate} disabled={disableInactivate}>
        <PowerOff className="h-4 w-4" />
        Inativar
      </Button>
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} />;
}

