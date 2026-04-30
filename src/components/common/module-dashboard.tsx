import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { PageTitle } from "@/components/common/page-title";
import { StatusBadge } from "@/components/common/status-badge";
import { Card } from "@/components/ui/card";

type DashboardCard = {
  title: string;
  description: string;
  icon: LucideIcon;
  href?: string;
  status?: "Disponível" | "Futuro" | "Em breve" | "Cadastro";
};

type ModuleDashboardProps = {
  title: string;
  description: string;
  cards: DashboardCard[];
  columns?: "three" | "four";
};

export function ModuleDashboard({ title, description, cards, columns = "four" }: ModuleDashboardProps) {
  const gridColumns = columns === "three" ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-4";

  return (
    <div className="space-y-6">
      <PageTitle title={title} description={description} />

      <div className={`grid gap-4 ${gridColumns}`}>
        {cards.map((card) => {
          const Icon = card.icon;
          const isEnabled = Boolean(card.href);
          const status = card.status ?? (isEnabled ? "Disponível" : "Futuro");
          const content = (
            <Card className="h-full border-border/80 p-5 shadow-sm shadow-primary/5 transition-colors hover:border-primary/30 hover:bg-card">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <StatusBadge status={isEnabled ? "success" : "visual"} label={status} />
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">{card.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
                </div>
                {isEnabled ? <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" /> : null}
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
