"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { AppNavBrand, AppNavTree } from "@/components/layout/app-nav-tree";
import { cn } from "@/lib/utils";

// A GAVETA DE NAVEGAÇÃO abaixo de 1024px (plano docs/codex/73).
//
// POR QUE ELA EXISTE: `app-sidebar.tsx` é `hidden ... lg:flex`, e abaixo de 1024px não havia
// NADA no lugar -- nem hambúrguer, nem drawer, nem barra inferior. Não era degradação, era
// ausência: quem abrisse o sistema num tablet em retrato não conseguia sair da página em que
// caiu. Está registrado desde o plano 70, §6.3a, e virou portão para a tela da governanta.
//
// REUSA A ÁRVORE, não copia. `AppNavTree` é a mesma que a barra lateral renderiza -- mesma
// visibilidade por permissão, mesmos grupos, mesmo item ativo. Uma barra inferior (a
// alternativa que mais tentou, e é o padrão certo para uso em movimento) exigiria uma lista
// curada própria: uma SEGUNDA fonte de verdade para navegação, que diverge no dia em que
// alguém acrescenta um item. Divergência de navegação é invisível até alguém não achar a tela.

export function AppNavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  // `Esc` fecha. Sem isso, num teclado externo acoplado ao tablet a gaveta vira armadilha.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Trava a rolagem do fundo enquanto a gaveta está aberta. Sem isso o dedo arrasta a página
  // atrás do painel, e a governanta perde o lugar na tela que estava lendo.
  useEffect(() => {
    if (!open) return;

    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [open]);

  // O foco entra no painel ao abrir. Sem isso, o leitor de tela continua lendo a página de trás
  // enquanto a gaveta cobre tudo.
  useEffect(() => {
    if (open) {
      panelRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 lg:hidden"
      role="presentation"
      data-testid="app-nav-drawer"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />

      {/*
        LARGURA POR ORIENTAÇÃO (plano 73, D2): em retrato ocupa a maior parte da tela, com teto
        para o menu não virar uma coluna de uma palavra; em paisagem abaixo de 1024 é mais
        estreita, porque há largura sobrando e cobrir tudo seria desnecessário.

        O que NÃO muda entre as duas é o que importa: o conteúdo, a ordem, o item ativo e os
        grupos abertos. Girar o tablet não pode reposicionar a governanta -- e por isso a
        alternância é por CSS sobre a MESMA árvore, nunca por detecção de orientação em
        JavaScript, que daria dois sistemas de decisão discordando num tablet pequeno deitado.
      */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
        className={cn(
          "absolute inset-y-0 left-0 flex w-[85vw] max-w-sm flex-col border-r border-border/80 bg-card shadow-2xl outline-none",
          "landscape:w-80"
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative">
          <AppNavBrand />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            data-testid="fechar-menu"
            className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/*
          FECHAR AO NAVEGAR. Sem isto a gaveta cobre exatamente a tela que a pessoa acabou de
          abrir, e ela precisa de um segundo gesto para ver o resultado do primeiro.
        */}
        <AppNavTree density="comfortable" onNavigate={onClose} />
      </div>
    </div>
  );
}
