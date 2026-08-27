"use client";

import { useRouter } from "next/navigation";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { useAppStore } from "@/store/app-store";

/**
 * Trava do 1o acesso (#C7, plano docs/codex/65, secao 4.2).
 *
 * Enquanto `mustChangePassword` for true, renderiza APENAS a tela de troca: sidebar,
 * cabecalho e conteudo nao sao montados. Depois da troca, `router.refresh()` faz o layout
 * (server component, force-dynamic) recarregar o SessionContext ja' com a flag limpa.
 *
 * ================== LIMITACAO CONHECIDA, DECLARADA ==================
 * Este gate e' CLIENT-SIDE. Ele impede o USO do sistema, nao o ACESSO aos dados.
 *
 * Um usuario com a flag armada que chame as rotas de API diretamente (curl, DevTools)
 * continua sendo atendido: a sessao dele e' valida e nenhuma rota checa a flag. Ou seja,
 * isto e' controle de EXPERIENCIA -- resolve "a senha temporaria do admin nao fica valendo
 * para sempre" --, e NAO e' defesa contra um usuario mal-intencionado.
 *
 * Vira defesa de verdade quando o middleware do #5 barrar toda requisicao autenticada de
 * quem tem a flag armada; ai este componente passa a ser so' a camada de UX sobre ele.
 * Ate' la', nao trate isto como protecao.
 * ====================================================================
 */
export function PasswordChangeGate({ children }: { children: React.ReactNode }) {
  const mustChangePassword = useAppStore((state) => state.mustChangePassword);
  const router = useRouter();

  if (!mustChangePassword) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
        <ChangePasswordForm
          forced
          onDone={() => {
            // Recarrega a sessao pelo servidor: a flag ja' foi limpa no banco pela rota.
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}
