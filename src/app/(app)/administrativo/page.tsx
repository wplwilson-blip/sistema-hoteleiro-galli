import { FileText, Megaphone, Scale, ShieldCheck } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";

const cards = [
  {
    title: "Comunicados futuros",
    description: "Comunicados internos e avisos administrativos serão criados em sprint futura.",
    icon: Megaphone
  },
  {
    title: "Documentos internos futuros",
    description: "Central de documentos administrativos será planejada em etapa posterior.",
    icon: FileText
  },
  {
    title: "Políticas futuras",
    description: "Políticas e normas internas ficarão para sprint específica.",
    icon: Scale
  },
  {
    title: "Auditorias futuras",
    description: "Rotinas de auditoria administrativa serão organizadas posteriormente.",
    icon: ShieldCheck
  }
];

export default function AdministrativoPage() {
  return (
    <ModuleDashboard
      title="Administrativo"
      description="Dashboard de entrada para comunicados, documentos internos, políticas e auditorias."
      cards={cards}
    />
  );
}
