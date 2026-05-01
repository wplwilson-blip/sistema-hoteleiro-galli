import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: "visual" | "warning" | "danger" | "success" | "info";
  label: string;
};

const statusClasses = {
  visual: "bg-muted text-muted-foreground",
  warning: "bg-accent/20 text-amber-700",
  danger: "bg-destructive/10 text-destructive",
  success: "bg-emerald-50 text-emerald-700",
  info: "bg-primary/10 text-primary"
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={cn("inline-flex max-w-full items-center rounded-md px-2 py-1 text-xs font-medium leading-snug whitespace-normal break-words", statusClasses[status])}>
      {label}
    </span>
  );
}
