import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Informe um usuario com pelo menos 3 caracteres.")
  .max(50, "Informe um usuario com no maximo 50 caracteres.")
  .regex(/^[a-z0-9._-]+$/, "Use apenas letras minusculas, numeros, ponto, underline e hifen.")
  .refine((value) => !value.includes("@"), "Username nao pode ser e-mail.");

export const passwordSchema = z
  .string()
  .min(10, "A senha deve ter pelo menos 10 caracteres.")
  .regex(/[A-Z]/, "A senha deve ter pelo menos uma letra maiuscula.")
  .regex(/[0-9]/, "A senha deve ter pelo menos um numero.")
  .regex(/[^A-Za-z0-9]/, "A senha deve ter pelo menos um caractere especial.");

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "Informe sua senha.")
});

export const initialSetupSchema = z
  .object({
    organizationName: z.string().trim().min(2, "Informe o nome da organizacao."),
    organizationTradeName: z.string().trim().min(2, "Informe o nome fantasia."),
    unitCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{2,20}$/, "Use 2 a 20 caracteres: letras maiusculas, numeros, underline ou hifen."),
    unitName: z.string().trim().min(2, "Informe o nome da unidade."),
    city: z.string().trim().min(2, "Informe a cidade."),
    state: z.string().trim().min(2, "Informe o estado."),
    totalRooms: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
    fullName: z.string().trim().min(3, "Informe o nome completo."),
    username: usernameSchema,
    cpf: z.string().trim().optional(),
    password: passwordSchema,
    confirmPassword: z.string()
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "A confirmacao deve ser igual a senha.",
    path: ["confirmPassword"]
  });

export function buildTechnicalAuthEmail(username: string) {
  return `${username}@internal.hotelgalli.local`;
}
