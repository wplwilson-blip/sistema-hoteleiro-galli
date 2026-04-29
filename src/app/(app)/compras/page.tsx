import Link from "next/link";
import { ChevronRight, ClipboardList, FileText, IdCard, LineChart, ShoppingCart } from "lucide-react";
import { PageTitle } from "@/components/common/page-title";
import { StatusBadge } from "@/components/common/status-badge";
import { Card } from "@/components/ui/card";

const cards = [
  {
    title: "Solicita\u00e7\u00f5es de compra",
    description: "Abrir e acompanhar solicita\u00e7\u00f5es de compra internas por unidade e departamento.",
    href: "/compras/solicitacoes",
    icon: ClipboardList,
    label: "Dispon\u00edvel"
  },
  {
    title: "Cota\u00e7\u00f5es",
    description: "Gerencie cota\u00e7\u00f5es e compara\u00e7\u00e3o de fornecedores por solicita\u00e7\u00e3o.",
    href: "/compras/cotacoes",
    icon: ShoppingCart,
    label: "Dispon\u00edvel"
  },
  {
    title: "Fornecedores",
    description: "Gerencie fornecedores antes de registrar cota\u00e7\u00f5es.",
    href: "/cadastros/fornecedores",
    icon: IdCard,
    label: "Cadastro"
  },
  {
    title: "Recebimentos",
    description: "Recebimento parcial, total e com diverg\u00eancia ficar\u00e1 para a pr\u00f3xima fase.",
    icon: FileText,
    label: "Em breve"
  },
  {
    title: "Indicadores",
    description: "Painel de acompanhamento e indicadores operacionais ser\u00e1 liberado depois.",
    icon: LineChart,
    label: "Em breve"
  }
];

export default function ComprasPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Compras" description="Gest\u00e3o de solicita\u00e7\u00f5es, cota\u00e7\u00f5es, aprova\u00e7\u00f5es e recebimentos de compras internas." />

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
