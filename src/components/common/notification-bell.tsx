import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NotificationBell() {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-10 w-10 rounded-md border border-border/70 bg-background hover:bg-muted"
      aria-label="Notificações"
    >
      <Bell className="h-5 w-5 text-primary" />
      <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-accent" />
    </Button>
  );
}
