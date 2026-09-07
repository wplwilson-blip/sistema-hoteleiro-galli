"use client";

import { AppNavBrand, AppNavTree } from "@/components/layout/app-nav-tree";

/**
 * A barra lateral do desktop. Acima de 1024px, NADA mudou (plano 73, D4): mesmo `<aside>`,
 * mesmas classes, mesma arvore.
 *
 * O conteudo saiu daqui para `app-nav-tree.tsx` porque a gaveta (`app-nav-drawer.tsx`) precisa
 * do MESMO menu -- e reusar a arvore e' o que impede as duas navegacoes de divergirem.
 *
 * `hidden ... lg:flex` continua: abaixo de 1024px quem navega e' a gaveta.
 */
export function AppSidebar() {
  return (
    <aside
      className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-border/80 bg-card lg:flex"
      data-testid="app-sidebar"
    >
      <AppNavBrand />
      <AppNavTree density="compact" />
    </aside>
  );
}
