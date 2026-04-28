import type { LucideIcon } from "lucide-react";
import { Layers } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";

type ModuleCardProps = {
  title: string;
  description: string;
  status: string;
  icon?: LucideIcon;
};

export function ModuleCard({ title, description, status, icon: Icon = Layers }: ModuleCardProps) {
  return (
    <div className="rounded-lg border border-border/80 bg-card p-4 shadow-sm shadow-primary/5 transition-colors hover:border-primary/25">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <StatusBadge status="info" label={status} />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
