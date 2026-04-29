"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { Building2, Loader2, ShieldCheck, User } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { initialSetupSchema } from "@/lib/auth/schemas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SetupForm = z.infer<typeof initialSetupSchema>;

export function InitialSetupForm() {
  const [formError, setFormError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<SetupForm>({
    resolver: zodResolver(initialSetupSchema),
    defaultValues: {
      organizationName: "Hotel Galli",
      organizationTradeName: "Hotel Galli",
      unitCode: "GALLI",
      unitName: "Hotel Galli",
      city: "",
      state: "",
      totalRooms: undefined,
      fullName: "",
      username: "",
      cpf: "",
      password: "",
      confirmPassword: ""
    }
  });

  async function onSubmit(values: SetupForm) {
    setFormError("");

    const response = await fetch("/api/setup/initial-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values)
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      setFormError(result.message ?? "Nao foi possivel concluir o setup.");
      return;
    }

    window.location.href = "/login";
  }

  return (
    <Card className="relative w-full max-w-xl border-border/80 bg-card/95 shadow-xl shadow-primary/10">
      <CardHeader className="space-y-5 pb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-white p-2 shadow-sm">
            <Image src="/brand/logo.png" alt="Hotel Galli" width={36} height={36} className="h-auto w-auto" />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">Hotel Galli</p>
            <p className="text-xs text-muted-foreground">Primeiro acesso administrativo</p>
          </div>
        </div>
        <div>
          <CardTitle className="text-2xl">Setup inicial</CardTitle>
          <CardDescription className="mt-2">Cadastre a rede, a unidade inicial e o Super Admin.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <fieldset className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-primary" />
              Organizacao e unidade
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome da organizacao" error={errors.organizationName?.message}>
                <Input {...register("organizationName")} />
              </Field>
              <Field label="Nome fantasia" error={errors.organizationTradeName?.message}>
                <Input {...register("organizationTradeName")} />
              </Field>
              <Field label="Codigo da unidade" error={errors.unitCode?.message}>
                <Input {...register("unitCode")} />
              </Field>
              <Field label="Nome da unidade" error={errors.unitName?.message}>
                <Input {...register("unitName")} />
              </Field>
              <Field label="Cidade" error={errors.city?.message}>
                <Input {...register("city")} />
              </Field>
              <Field label="Estado" error={errors.state?.message}>
                <Input {...register("state")} />
              </Field>
              <Field label="Numero total de UHs" error={errors.totalRooms?.message}>
                <Input type="number" min={1} {...register("totalRooms")} />
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Super Admin
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome completo" error={errors.fullName?.message}>
                <Input {...register("fullName")} />
              </Field>
              <Field label="Usuario" error={errors.username?.message}>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" autoComplete="username" placeholder="nome.sobrenome" {...register("username")} />
                </div>
              </Field>
              <Field label="CPF" error={errors.cpf?.message}>
                <Input {...register("cpf")} />
              </Field>
              <Field label="Senha" error={errors.password?.message}>
                <Input type="password" autoComplete="new-password" {...register("password")} />
              </Field>
              <Field label="Confirmar senha" error={errors.confirmPassword?.message}>
                <Input type="password" autoComplete="new-password" {...register("confirmPassword")} />
              </Field>
            </div>
          </fieldset>

          {formError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p> : null}

          <Button className="h-11 w-full shadow-sm" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Criar Super Admin
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  const id = label.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
