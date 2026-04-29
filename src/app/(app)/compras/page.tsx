import Link from "next/link";
import { ClipboardList, ChevronRight, FileText, LineChart, ShoppingCart } from "lucide-react";
import { PageTitle } from "@/components/common/page-title";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/status-badge";

const cards = [
  {
    title: "Solicitacoes de compra",
    description: "Abrir e acompanhar solicitacoes de compra internas por unidade e departamento.",
    href: "/compras/solicitacoes",
    icon: ClipboardList,
    label: "Disponivel"
  },
  {
    title: "Cotacoes",
    description: "Fluxo de cotacao sera detalhado em sprint futura.",
    icon: ShoppingCart,
    label: "Em breve"
  },
  {
    title: "Recebimentos",
    description: "Recebimento parcial, total e com divergencia ficara para a proxima fase.",
    icon: FileText,
    label: "Em breve"
  },
  {
    title: "Indicadores",
    description: "Painel de acompanhamento e indicadores operacionais sera liberado depois.",
    icon: LineChart,
    label: "Em breve"
  }
];

export default function ComprasPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Compras" description="Gestao de solicitacoes, cotacoes, aprovacoes e recebimentos de compras internas." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const content = (
            <Card className="h-full border-border/80 p-5 shadow-sm shadow-primary/5 transition-colors hover:border-primary/30 hover:bg-card">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <StatusBadge status={card.href ? "success" : "visual"} label={card.label} />
              </div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{card.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
                </div>
                {card.href ? <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" /> : null}
              </div>
            </Card>
          );

          return card.href ? (
            <Link key={card.title} href={card.href}>
              {content}
            </Link>
          ) : (
            <div key={card.title}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}

