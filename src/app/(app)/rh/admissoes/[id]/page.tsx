import { HrAdmissionDetailClient } from "@/components/hr/hr-admission-detail-client";

export default function RhAdmissionDetailPage({ params }: { params: { id: string } }) {
  return <HrAdmissionDetailClient id={params.id} />;
}
