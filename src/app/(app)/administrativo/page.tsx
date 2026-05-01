import { FileText, Megaphone, Scale, ShieldCheck } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";

const cards = [
  {
    title: "Comunicados",
    description: "Comunicados internos e avisos administrativos serão criados em próxima etapa.",
    icon: Megaphone,
    status: "Em breve" as const
  },
  {
    title: "Documentos internos",
    description: "Central de documentos administrativos será planejada em próxima etapa.",
    icon: FileText,
    status: "Em breve" as const
  },
  {
    title: "Políticas",
    description: "Políticas e normas internas serão organizadas em próxima etapa.",
    icon: Scale,
    status: "Em breve" as const
  },
  {
    title: "Auditorias",
    description: "Rotinas de auditoria administrativa serão organizadas em próxima etapa.",
    icon: ShieldCheck,
    status: "Em breve" as const
  }
];

export default function AdministrativoPage() {
  return (
    <ModuleDashboard
      title="Administrativo"
      description="Entrada para comunicados, documentos internos, políticas e auditorias."
      cards={cards}
    />
  );
}
