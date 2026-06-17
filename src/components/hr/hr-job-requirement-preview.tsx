import { ClipboardList } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { Card } from "@/components/ui/card";
import {
  findJobRequirementRule,
  type FindJobRequirementRuleInput,
  type HrAlertRequirementItem,
  type HrJobRequirementItem,
  type HrJobRequirementLevel,
  type HrJobRequirementRule,
  type HrTrainingRequirementItem
} from "@/lib/hr/job-requirement-rules";

type RequirementPreviewItem = HrJobRequirementItem | HrTrainingRequirementItem | HrAlertRequirementItem;

type HrJobRequirementPreviewProps = FindJobRequirementRuleInput & {
  surface?: "card" | "section";
  mode?: "full" | "summary";
  className?: string;
  title?: string;
  description?: string;
};

const requirementLevelLabels: Record<HrJobRequirementLevel, string> = {
  required: "Obrigatorio",
  recommended: "Recomendado",
  confirm_with_sst: "Confirmar com SST",
  conditional: "Condicional"
};

const requirementLevelStatus: Record<HrJobRequirementLevel, "visual" | "warning" | "danger" | "success" | "info"> = {
  required: "info",
  recommended: "visual",
  confirm_with_sst: "warning",
  conditional: "warning"
};

const conditionLabels: Record<string, string> = {
  performs_electrical_work: "Aplicar se executar eletrica.",
  works_above_2m: "Aplicar se houver trabalho acima de 2m.",
  handles_food: "Aplicar se manipular alimentos.",
  uses_chemical_products: "Aplicar se usar produtos quimicos.",
  uses_cutting_tools: "Aplicar se usar ferramentas cortantes.",
  works_with_heat: "Aplicar se trabalhar com calor.",
  works_in_laundry_noise: "Aplicar se houver ruido relevante na lavanderia.",
  security_periculosidade_review: "Depende de revisao de periculosidade com SST/trabalhista."
};

function RequirementList({ items }: { items: RequirementPreviewItem[] }) {
  if (!items.length) {
    return <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Nenhum item sugerido nesta secao.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.key} className="rounded-md border bg-background px-3 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-sm font-medium leading-5">{item.name}</p>
            <StatusBadge status={requirementLevelStatus[item.level]} label={requirementLevelLabels[item.level]} />
            <StatusBadge status="visual" label="Sugerido" />
          </div>
          {item.level === "confirm_with_sst" ? <p className="mt-1 text-xs font-medium text-amber-700">Depende de validacao da Seguranca do Trabalho.</p> : null}
          {item.condition ? <p className="mt-1 text-xs font-medium text-amber-700">{conditionLabels[item.condition] ?? item.condition}</p> : null}
          {"validityDays" in item && item.validityDays ? <p className="mt-1 text-xs text-muted-foreground">Validade sugerida: {item.validityDays} dias.</p> : null}
          {"alertBeforeDays" in item && item.alertBeforeDays ? <p className="mt-1 text-xs text-muted-foreground">Alerta sugerido: {item.alertBeforeDays} dias antes.</p> : null}
          {item.notes ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.notes}</p> : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusBadge status="visual" label="Futuramente: Aceitar" />
            <StatusBadge status="visual" label="Futuramente: Remover" />
            {item.level === "confirm_with_sst" || item.level === "conditional" ? <StatusBadge status="warning" label="Futuramente: Confirmar com SST" /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function RequirementSection({ title, items }: { title: string; items: RequirementPreviewItem[] }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">{items.length} item(ns)</span>
      </div>
      <RequirementList items={items} />
    </section>
  );
}

function PreviewContent({
  rule,
  hasSelection,
  title,
  description,
  mode
}: {
  rule: HrJobRequirementRule | null;
  hasSelection: boolean;
  title: string;
  description: string;
  mode: "full" | "summary";
}) {
  return (
    <>
      <div className="mb-3 flex items-start gap-2">
        <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>

      {!hasSelection ? (
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Selecione um cargo para visualizar a previa das regras automaticas.</p>
      ) : !rule ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Nenhuma regra automatica encontrada para este cargo. Revise cargo, CBO ou setor.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status="info" label={rule.sector} />
              {rule.cboCodes.slice(0, 3).map((code) => <StatusBadge key={code} status="visual" label={`CBO: ${code}`} />)}
              <StatusBadge status="visual" label="Preview sem geracao real" />
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{rule.riskDescription}</p>
            <p className="mt-2 rounded-md border bg-background px-3 py-2 text-xs font-medium leading-5 text-muted-foreground">
              Uniforme: item operacional obrigatorio para todos os cargos. EPI tecnico depende dos riscos da funcao e validacao da Seguranca do Trabalho.
            </p>
          </div>
          {mode === "summary" ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <SummaryTile label="Documentos" count={rule.documentRequirements.length} />
              <SummaryTile label="Saude ocupacional" count={rule.occupationalHealthRequirements.length} />
              <SummaryTile label="Treinamentos" count={rule.trainingRequirements.length} />
              <SummaryTile label="Uniforme operacional" count={rule.uniformRequirements.length} description="Obrigatorio conforme padrao operacional da unidade." />
              <SummaryTile label="EPIs tecnicos" count={rule.epiRequirements.length} description="Dependem de risco, cargo e validacao SST." />
              <SummaryTile label="Onboarding" count={rule.onboardingRequirements.length} />
              <SummaryTile label="Alertas" count={rule.alertRules.length} />
            </div>
          ) : (
            <>
              <RequirementSection title="Documentos" items={rule.documentRequirements} />
              <RequirementSection title="Treinamentos" items={rule.trainingRequirements} />
              <RequirementSection title="Saude ocupacional" items={rule.occupationalHealthRequirements} />
              <RequirementSection title="Uniforme operacional" items={rule.uniformRequirements} />
              <RequirementSection title="EPIs tecnicos" items={rule.epiRequirements} />
              <RequirementSection title="Onboarding" items={rule.onboardingRequirements} />
              <RequirementSection title="Alertas" items={rule.alertRules} />
            </>
          )}
        </div>
      )}
    </>
  );
}

function SummaryTile({ label, count, description = "Resumo para orientar a vaga. A revisao completa acontece na admissao." }: { label: string; count: number; description?: string }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <StatusBadge status={count ? "info" : "visual"} label={`${count} item(ns)`} />
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

export function HrJobRequirementPreview({
  surface = "card",
  mode = "full",
  className,
  title = "Regras sugeridas do cargo",
  description = "Estas regras sao sugestoes baseadas na matriz PGR/PCMSO/CBO. Revise antes de usar na admissao.",
  ...input
}: HrJobRequirementPreviewProps) {
  const rule = findJobRequirementRule(input);
  const hasSelection = Boolean(input.ruleGroup || input.cboCode || input.jobTitle || input.sector || input.department);

  if (surface === "section") {
    return (
      <section className={className}>
        <PreviewContent rule={rule} hasSelection={hasSelection} title={title} description={description} mode={mode} />
      </section>
    );
  }

  return (
    <Card className={className ?? "min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5"}>
      <PreviewContent rule={rule} hasSelection={hasSelection} title={title} description={description} mode={mode} />
    </Card>
  );
}
