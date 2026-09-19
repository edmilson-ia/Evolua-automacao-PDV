import { z } from "zod";
import { normalizarTelefone } from "@/lib/telefone";

// Texto opcional: vazio vira null
const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres`)
    .nullish()
    .transform((v) => v || null);

export const clienteSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do cliente").max(80, "Nome muito longo (máx. 80)"),
  telefone: opcional(20)
    .refine((v) => v === null || normalizarTelefone(v) !== null, "Telefone inválido: informe o DDD e o número")
    .transform((v) => (v === null ? null : normalizarTelefone(v))),
  email: opcional(120).refine((v) => v === null || z.email().safeParse(v).success, "E-mail inválido"),
  endereco: opcional(200),
});

export type ClienteInput = z.input<typeof clienteSchema>;

export type Cliente = {
  id: string;
  nome: string;
  /** Só dígitos, com DDD. */
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  criado_em: string;
};

export const COLUNAS_CLIENTE = "id, nome, telefone, email, endereco, criado_em";
