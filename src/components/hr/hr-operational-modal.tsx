"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type HrOperationalModalProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  size?: "lg" | "xl";
};

export function HrOperationalModal({
  open,
  title,
  description,
  children,
  onClose,
  size = "xl"
}: HrOperationalModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 px-3 py-6 sm:py-10">
      <div
        aria-modal="true"
        className={`w-full ${size === "lg" ? "max-w-3xl" : "max-w-5xl"} rounded-md border bg-background shadow-xl`}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description ? <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p> : null}
          </div>
          <Button aria-label="Fechar" size="sm" type="button" variant="outline" onClick={onClose}>
            <X className="h-4 w-4" />
            Fechar
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
