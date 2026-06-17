import Link from "next/link";
import { ChevronRight, Compass, ListChecks, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

type RecruitmentBreadcrumbItem = {
  label: string;
  href?: string;
};

export function HrRecruitmentBreadcrumb({ items }: { items: RecruitmentBreadcrumbItem[] }) {
  const allItems = [
    { label: "RH", href: "/rh" },
    { label: "Recrutamento e Admissao" },
    ...items
  ];

  return (
    <nav aria-label="Caminho operacional" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {allItems.map((item, index) => {
        const isLast = index === allItems.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-1">
            {item.href && !isLast ? (
              <Link href={item.href} className="font-medium text-primary hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "font-medium text-foreground" : undefined}>{item.label}</span>
            )}
            {!isLast ? <ChevronRight className="h-3 w-3" /> : null}
          </span>
        );
      })}
    </nav>
  );
}

export function HrOperationalGuidanceCard({
  title,
  description,
  icon: Icon = Compass
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  return (
    <Card className="min-w-0 border-border/80 bg-card/95 p-4 shadow-sm shadow-primary/5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted/40">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
    </Card>
  );
}

export function HrRecruitmentGuidance({
  where,
  next
}: {
  where: string;
  next: string;
}) {
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <HrOperationalGuidanceCard title="Onde estou?" description={where} icon={Compass} />
      <HrOperationalGuidanceCard title="O que fazer agora?" description={next} icon={ListChecks} />
    </div>
  );
}
