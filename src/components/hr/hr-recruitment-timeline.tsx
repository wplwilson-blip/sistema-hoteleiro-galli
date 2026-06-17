import { ArrowRight, CheckCircle2, Circle, Clock3, type LucideIcon } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type HrRecruitmentStageKey =
  | "request"
  | "approval"
  | "opening"
  | "candidates"
  | "candidate_approved"
  | "admission"
  | "documents"
  | "accounting"
  | "registration"
  | "onboarding"
  | "active";

type TimelineMode = "full" | "job_opening" | "candidate" | "admission";

type StageStatus = "done" | "current" | "upcoming";

const allStages: Array<{ key: HrRecruitmentStageKey; label: string; description: string }> = [
  { key: "request", label: "Solicitacao da vaga", description: "Necessidade registrada pelo RH ou gestor." },
  { key: "approval", label: "Aprovacao da abertura", description: "Validacao humana antes do recrutamento." },
  { key: "opening", label: "Vaga aberta", description: "Processo liberado para recrutamento." },
  { key: "candidates", label: "Candidatos", description: "Triagem, entrevistas e parecer humano." },
  { key: "candidate_approved", label: "Candidato aprovado", description: "Decisao humana pronta para admissao." },
  { key: "admission", label: "Admissao iniciada", description: "Processo admissional criado." },
  { key: "documents", label: "Documentos", description: "Solicitacao, recebimento e conferencia." },
  { key: "accounting", label: "Contabilidade", description: "Envio administrativo para registro." },
  { key: "registration", label: "Registro", description: "Registro concluido fora deste preview." },
  { key: "onboarding", label: "Onboarding", description: "Integracao inicial e rotina de entrada." },
  { key: "active", label: "Colaborador ativo", description: "Fim da jornada admissional." }
];

const modeStages: Record<TimelineMode, HrRecruitmentStageKey[]> = {
  full: allStages.map((stage) => stage.key),
  job_opening: ["request", "approval", "opening", "candidates", "candidate_approved", "admission"],
  candidate: ["candidates", "candidate_approved", "admission", "documents", "onboarding"],
  admission: ["admission", "documents", "accounting", "registration", "onboarding", "active"]
};

const statusLabels: Record<StageStatus, string> = {
  done: "Concluido",
  current: "Atual",
  upcoming: "Proximo"
};

const statusIcons: Record<StageStatus, LucideIcon> = {
  done: CheckCircle2,
  current: Clock3,
  upcoming: Circle
};

function stageStatus(stageIndex: number, currentIndex: number): StageStatus {
  if (stageIndex < currentIndex) return "done";
  if (stageIndex === currentIndex) return "current";
  return "upcoming";
}

export function HrRecruitmentTimeline({
  currentStage,
  mode = "full",
  title = "Linha do tempo do processo",
  description = "Visao cronologica para orientar a proxima acao do RH.",
  note,
  className
}: {
  currentStage: HrRecruitmentStageKey;
  mode?: TimelineMode;
  title?: string;
  description?: string;
  note?: string;
  className?: string;
}) {
  const keys = modeStages[mode];
  const stages = keys.map((key) => allStages.find((stage) => stage.key === key)).filter(Boolean) as typeof allStages;
  const currentIndex = Math.max(0, stages.findIndex((stage) => stage.key === currentStage));

  return (
    <Card className={className ?? "min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5"}>
      <div className="mb-4 flex min-w-0 flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <StatusBadge status="info" label={stages[currentIndex]?.label ?? "Etapa atual"} />
      </div>

      <div className="max-w-full overflow-x-auto pb-1">
        <ol className="flex min-w-[860px] gap-2 lg:min-w-0">
          {stages.map((stage, index) => {
            const status = stageStatus(index, currentIndex);
            const Icon = statusIcons[status];
            return (
              <li key={stage.key} className="relative min-w-[135px] flex-1">
                <div
                  className={cn(
                    "h-full rounded-md border bg-background p-3",
                    status === "done" && "border-emerald-200 bg-emerald-50/60",
                    status === "current" && "border-primary/40 bg-primary/5 shadow-sm shadow-primary/10"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", status === "done" ? "text-emerald-700" : status === "current" ? "text-primary" : "text-muted-foreground")} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold leading-4 text-foreground">{stage.label}</p>
                      <p className="mt-1 text-xs leading-4 text-muted-foreground">{stage.description}</p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <StatusBadge status={status === "done" ? "success" : status === "current" ? "info" : "visual"} label={statusLabels[status]} />
                  </div>
                </div>
                {index < stages.length - 1 ? <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground xl:block" /> : null}
              </li>
            );
          })}
        </ol>
      </div>

      {note ? <p className="mt-3 rounded-md border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">{note}</p> : null}
    </Card>
  );
}
