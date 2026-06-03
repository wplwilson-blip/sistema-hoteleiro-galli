import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { loadHrExecutiveDashboard, loadHrPendingCenter } from "@/lib/hr/executive-dashboard";
import { parseSearchParams } from "@/lib/hr/schemas";

const querySchema = z.object({
  type: z.enum(["colaboradores", "treinamentos", "saude_ocupacional", "movimentacoes", "conduta", "desligamentos"]).default("colaboradores"),
  unitId: z.string().uuid("Unidade invalida.").optional()
});

function csvValue(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: Array<Record<string, unknown>>) {
  return [headers.map(csvValue).join(","), ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(","))].join("\n");
}

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.employeesView);
  if (response || !context) return response;

  try {
    const query = parseSearchParams(request, querySchema);
    if (query.unitId && !context.isSuperAdmin && !context.accessibleUnitIds.includes(query.unitId)) {
      return hrApiError("Voce nao tem permissao para acessar esta unidade.", 403);
    }
    const dashboard = await loadHrExecutiveDashboard(context, query.unitId);
    const pendencies = await loadHrPendingCenter(context, query.unitId);
    const rows = query.type === "colaboradores"
      ? dashboard.byUnit.map((unit) => ({ Unidade: unit.unitLabel, Colaboradores: unit.employees, Avaliacoes: unit.evaluationsPending, Desligamentos: unit.terminations }))
      : pendencies.filter((item) => {
          const map: Record<string, string[]> = {
            treinamentos: ["trainings"],
            saude_ocupacional: ["occupational"],
            movimentacoes: ["movements"],
            conduta: ["conduct"],
            desligamentos: ["terminations"]
          };
          return map[query.type]?.includes(item.type);
        }).map((item) => ({ Tipo: item.typeLabel, Colaborador: item.employeeName, Unidade: item.unitLabel, Prioridade: item.priority, Data: item.date, Origem: item.origin }));
    const headers = rows[0] ? Object.keys(rows[0]) : ["Tipo", "Colaborador", "Unidade", "Prioridade", "Data", "Origem"];
    const csv = toCsv(headers, rows);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rh-${query.type}.csv"`
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel exportar relatorio consolidado.");
  }
}
