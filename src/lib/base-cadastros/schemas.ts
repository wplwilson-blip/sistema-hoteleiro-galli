import { z } from "zod";

export const recordStatusSchema = z.enum(["active", "inactive", "archived"]);

export const unitPayloadSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,20}$/, "Use 2 a 20 caracteres: letras maiusculas, numeros, underline ou hifen."),
  name: z.string().trim().min(2, "Informe o nome da unidade."),
  city: z.string().trim().min(2, "Informe a cidade."),
  state: z.string().trim().min(2, "Informe o estado."),
  status: recordStatusSchema.default("active")
});

export const departmentPayloadSchema = z.object({
  unitId: z.string().uuid("Selecione uma unidade."),
  code: z
    .string()
    .trim()
    .min(2, "Informe um codigo de departamento.")
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,20}$/, "Use um codigo padrao com 2 a 20 caracteres, sem espacos."),
  name: z.string().trim().min(2, "Informe o nome do departamento."),
  description: z.string().trim().optional(),
  status: recordStatusSchema.default("active")
});

export const jobPositionPayloadSchema = z.object({
  unitId: z.string().uuid("Selecione uma unidade."),
  departmentId: z.string().uuid("Selecione um departamento.").optional().or(z.literal("").transform(() => undefined)),
  code: z
    .string()
    .trim()
    .min(2, "Informe um codigo de cargo.")
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,30}$/, "Use um codigo padrao com 2 a 30 caracteres, sem espacos. Hifen e permitido."),
  name: z.string().trim().min(2, "Informe o nome do cargo."),
  description: z.string().trim().optional(),
  isLeadership: z.boolean().default(false),
  status: recordStatusSchema.default("active")
});

export const employeePayloadSchema = z.object({
  unitId: z.string().uuid("Selecione uma unidade."),
  departmentId: z.string().uuid("Selecione um departamento.").optional().or(z.literal("").transform(() => undefined)),
  jobPositionId: z.string().uuid("Selecione um cargo.").optional().or(z.literal("").transform(() => undefined)),
  fullName: z.string().trim().min(3, "Informe o nome completo do colaborador."),
  preferredName: z.string().trim().optional(),
  documentNumber: z.string().trim().optional(),
  corporateEmail: z.string().trim().email("Informe um e-mail corporativo valido.").optional().or(z.literal("").transform(() => undefined)),
  personalEmail: z.string().trim().email("Informe um e-mail pessoal valido.").optional().or(z.literal("").transform(() => undefined)),
  phone: z.string().trim().optional(),
  hireDate: z.string().trim().optional(),
  terminationDate: z.string().trim().optional(),
  status: recordStatusSchema.default("active")
});
