import { z } from "zod";
import { hrRecordStatusSchema } from "@/lib/hr/schemas";

const emptyToUndefined = z.literal("").transform(() => undefined);
export const optionalOnboardingUuidSchema = z.string().uuid("Identificador invalido.").optional().or(emptyToUndefined);
const optionalIntegerSchema = (min: number, max: number) =>
  z.preprocess((value) => (value === "" || value == null ? undefined : value), z.coerce.number().int().min(min).max(max).optional());

export const onboardingPlansQuerySchema = z.object({
  unitId: optionalOnboardingUuidSchema,
  departmentId: optionalOnboardingUuidSchema,
  jobPositionId: optionalOnboardingUuidSchema,
  status: hrRecordStatusSchema.optional().or(emptyToUndefined),
  search: z.string().trim().max(120, "Busca muito longa.").optional().or(emptyToUndefined)
});

export const onboardingPlanPayloadSchema = z.object({
  organizationId: optionalOnboardingUuidSchema,
  unitId: optionalOnboardingUuidSchema,
  departmentId: optionalOnboardingUuidSchema,
  jobPositionId: optionalOnboardingUuidSchema,
  admissionType: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{2,60}$/, "Use apenas letras, numeros, hifen ou sublinhado.")
    .optional()
    .or(emptyToUndefined),
  name: z.string().trim().min(3, "Informe o nome do plano.").max(160, "Nome muito longo."),
  description: z.string().trim().max(2000, "Descricao muito longa.").optional().or(emptyToUndefined),
  priority: optionalIntegerSchema(0, 10000).default(100),
  status: hrRecordStatusSchema.optional().default("active")
});

export const onboardingPlanItemPayloadSchema = z.object({
  title: z.string().trim().min(3, "Informe o titulo do item.").max(160, "Titulo muito longo."),
  description: z.string().trim().max(2000, "Descricao muito longa.").optional().or(emptyToUndefined),
  category: z.enum(["document", "training", "access", "uniform", "epi", "equipment", "policy", "operational_orientation", "manager_validation", "other"]),
  ownerArea: z.enum(["RH", "GESTOR", "TI", "GOVERNANCA", "RECEPCAO", "COZINHA", "MANUTENCAO", "AB", "ADMINISTRATIVO"]),
  responsibleProfileCode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_]{2,40}$/, "Perfil responsavel invalido.")
    .optional()
    .or(emptyToUndefined),
  dueDaysAfterStart: optionalIntegerSchema(0, 3650),
  isRequired: z.boolean().optional().default(true),
  isCritical: z.boolean().optional().default(false),
  blocksOperationalRelease: z.boolean().optional().default(false),
  relatedDocumentTypeId: optionalOnboardingUuidSchema,
  sortOrder: optionalIntegerSchema(0, 10000).default(0),
  status: hrRecordStatusSchema.optional().default("active")
});
