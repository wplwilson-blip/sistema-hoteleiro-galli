import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type StatCardProps = {
  title: string;
  value: string;
  icon: LucideIcon;
  tone?: "neutral" | "info" | "warning" | "danger";
};

const toneClasses = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-primary/10 text-primary",
  warning: "bg-accent/20 text-amber-800",
  danger: "bg-destructive/10 text-destructive"
};

export function StatCard({ title, value, icon: Icon, tone = "neutral" }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border/80 bg-card p-5 shadow-sm shadow-primary/5 transition-colors hover:border-primary/25">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
        </div>
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-md", toneClasses[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
