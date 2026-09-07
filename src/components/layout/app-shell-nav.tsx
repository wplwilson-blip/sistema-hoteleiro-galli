"use client";

import { useCallback, useState } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { AppNavDrawer } from "@/components/layout/app-nav-drawer";

// Segura o estado aberto/fechado da gaveta e renderiza os DOIS lados dele: o botão, que mora
// dentro do cabeçalho, e o painel, que é irmão do cabeçalho (plano docs/codex/73, D5).
//
// POR QUE UM COMPONENTE SÓ PARA ISSO:
//
//   1. `(app)/layout.tsx` é componente de SERVIDOR e não pode segurar estado.
//
//   2. O painel precisa ser IRMÃO do cabeçalho, não filho. O `<header>` é `sticky z-20`, o que
//      cria um contexto de empilhamento: uma gaveta renderizada dentro dele ficaria presa nesse
//      contexto. É exatamente o "z-index atrás do header" que o §5 do plano nomeia como um dos
//      modos de falha que teste unitário não pega -- e que aqui é evitado por construção.
//
//   3. `app-store` global foi descartado: a gaveta é detalhe de apresentação de UM lugar, e
//      pô-la no store convidaria qualquer tela a mexer nela.

export function AppShellNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  // Estáveis para não recriar o handler a cada render do cabeçalho.
  const abrir = useCallback(() => setMenuOpen(true), []);
  const fechar = useCallback(() => setMenuOpen(false), []);

  return (
    <>
      <AppHeader onOpenMenu={abrir} />
      <AppNavDrawer open={menuOpen} onClose={fechar} />
    </>
  );
}
