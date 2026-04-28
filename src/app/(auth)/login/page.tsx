"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { Lock, ShieldCheck, User } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const loginSchema = z.object({
  username: z.string().min(3, "Informe um usuário com pelo menos 3 caracteres."),
  password: z.string().min(6, "Informe uma senha com pelo menos 6 caracteres.")
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: ""
    }
  });

  function onSubmit() {
    window.location.href = "/dashboard";
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_480px]">
        <section className="relative hidden overflow-hidden bg-primary px-12 py-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
          <Image
            src="/brand/login-bg.png"
            alt=""
            fill
            priority
            sizes="calc(100vw - 480px)"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-primary/80" />
          <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(7,44,48,0.92)_0%,rgba(7,44,48,0.62)_52%,rgba(7,44,48,0.84)_100%)]" />

          <div className="relative flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white/95 p-2 shadow-lg">
              <Image src="/brand/logo.png" alt="Hotel Galli" width={42} height={42} className="h-auto w-auto" />
            </div>
            <div>
              <p className="text-lg font-semibold">Hotel Galli</p>
              <p className="text-xs uppercase tracking-[0.18em] text-primary-foreground/70">Gestão multiunidade</p>
            </div>
          </div>

          <div className="relative max-w-2xl pb-8">
            <div className="mb-6 inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-primary-foreground/85 backdrop-blur">
              <ShieldCheck className="h-4 w-4 text-accent" />
              Administração, aprovações e evidências
            </div>
            <h1 className="text-4xl font-semibold leading-tight">
              Operação, aprovações, evidências e indicadores em um único ambiente.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-primary-foreground/78">
              Controle visual da rotina administrativa com foco em padronização, auditoria e gestão da rede.
            </p>
          </div>
        </section>

        <section className="relative flex items-center justify-center px-6 py-10">
          <div className="absolute inset-x-0 top-0 h-40 bg-primary/5 lg:hidden" />
          <Card className="relative w-full max-w-md border-border/80 bg-card/95 shadow-xl shadow-primary/10">
            <CardHeader className="space-y-5 pb-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-white p-2 shadow-sm">
                  <Image src="/brand/logo.png" alt="Hotel Galli" width={36} height={36} className="h-auto w-auto" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-primary">Hotel Galli</p>
                  <p className="text-xs text-muted-foreground">Sistema Administrativo Hotel Galli</p>
                </div>
              </div>
              <div>
                <CardTitle className="text-2xl">Acessar sistema</CardTitle>
                <CardDescription className="mt-2">Entre com seu usuário e senha corporativos.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
                <div className="space-y-2">
                  <Label htmlFor="username">Usuário</Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="username"
                      className="h-11 pl-9"
                      autoComplete="username"
                      placeholder="nome.sobrenome"
                      {...register("username")}
                    />
                  </div>
                  {errors.username ? <p className="text-sm text-destructive">{errors.username.message}</p> : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      className="h-11 pl-9"
                      autoComplete="current-password"
                      {...register("password")}
                    />
                  </div>
                  {errors.password ? <p className="text-sm text-destructive">{errors.password.message}</p> : null}
                </div>

                <Button className="h-11 w-full shadow-sm" type="submit">
                  Entrar
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
