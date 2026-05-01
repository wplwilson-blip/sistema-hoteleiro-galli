import { ClipboardCheck, FileClock, History, ShieldCheck } from "lucide-react";
import { PageTitle } from "@/components/common/page-title";
import { Card } from "@/components/ui/card";

const approvalLevels = [
  { range: "Até R$ 200,00", level: "Gerência Administrativa" },
  { range: "Acima de R$ 200,00", level: "Diretoria Geral" }
];

const cards = [
  {
    title: "Aguardando Sprint 5D",
    description: "A aprovação real de compras será implementada na próxima sprint.",
    icon: FileClock
  },
  {
    title: "Compras aguardando aprovação",
    description: "Aqui serão listadas as compras com cotação vencedora e necessidade de aprovação.",
    icon: ClipboardCheck
  },
  {
    title: "Histórico de decisão",
    description: "Justificativas de exceção e histórico de aprovação serão tratados na Sprint 5D.",
    icon: History
  }
];

export default function AprovacoesComprasPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Aprovações de compras"
        description="Compras com cotação vencedora e necessidade de aprovação serão tratadas nesta área."
      />

      <section className="rounded-lg border bg-card p-5 shadow-sm shadow-primary/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Entrada futura do fluxo</p>
            <h2 className="text-lg font-semibold">Aprovação real ainda não está ativa</h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Esta página antecipa a área operacional da Sprint 5D sem criar ações de aprovar ou reprovar nesta etapa.
            </p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
            <ShieldCheck className="h-4 w-4" />
            Próxima etapa
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-5 shadow-sm shadow-primary/5">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Alçadas previstas</h2>
          <p className="text-sm text-muted-foreground">Toda compra com cotação vencedora aguardará aprovação conforme o valor selecionado.</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {approvalLevels.map((level) => (
            <div key={level.range} className="rounded-md border bg-background p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">{level.range}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{level.level}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <Card key={card.title} className="h-full border-border/80 p-5 shadow-sm shadow-primary/5">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold">{card.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
