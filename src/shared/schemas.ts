import { z } from "zod";

/**
 * Validação HTTP incremental. Os erros e seus códigos permanecem definidos
 * nos handlers: contratos antigos não devem mudar por uma troca de biblioteca.
 */
export const loginSchema = z.object({
  usuario: z.string().max(80),
  senha: z.string().max(256)
});

export const timeSchema = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
export const pointTypeSchema = z.enum([
  "entrada", "ida_intervalo", "volta_intervalo", "saida"
]);
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
