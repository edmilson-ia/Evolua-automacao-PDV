import { z } from "zod";

/** Formas conferidas no fechamento do caixa. */
export const FORMAS_CAIXA = ["dinheiro", "debito", "credito", "pix"] as const;
export type FormaCaixa = (typeof FORMAS_CAIXA)[number];

export type ResumoCaixa = {
  valor_inicial: number;
  vendas: Record<FormaCaixa, number> & { qtd: number; total: number };
  canceladas: { qtd: number; total: number };
  sangrias: number;
  suprimentos: number;
  /** valor inicial + vendas em dinheiro + suprimentos − sangrias */
  esperado_dinheiro: number;
};

export type ConferenciaForma = { esperado: number; contado: number | null; diferenca: number | null };
/** Guardada ao fechar: o relatório fechado não muda mais. */
export type Conferencia = { formas: Record<FormaCaixa, ConferenciaForma>; resumo: ResumoCaixa };

export type Caixa = {
  id: string;
  terminal: string;
  operador_id: string;
  operador_nome: string;
  aberto_em: string;
  valor_inicial: number;
  status: "aberto" | "fechado";
  fechado_em: string | null;
  fechado_por_nome: string | null;
  valor_contado: number | null;
  diferenca: number | null;
  conferencia: Conferencia | null;
  observacao: string | null;
};

export const COLUNAS_CAIXA =
  "id, terminal, operador_id, operador_nome, aberto_em, valor_inicial, status, fechado_em, fechado_por_nome, valor_contado, diferenca, conferencia, observacao";

export type CaixaAberto = Pick<Caixa, "id" | "terminal" | "aberto_em" | "valor_inicial">;

export type MovimentoCaixa = {
  id: string;
  tipo: "sangria" | "suprimento";
  valor: number;
  motivo: string;
  operador_nome: string;
  criado_em: string;
};

// ---- entrada das APIs (o cliente manda números já convertidos: campo em branco = null) ----
export const abrirCaixaSchema = z.object({
  terminal: z.string().trim().min(1, "Informe o terminal").max(30, "Terminal: no máximo 30 caracteres"),
  valor_inicial: z.number({ error: "Informe o valor inicial" }).min(0, "Valor inicial inválido").max(1_000_000),
});

export const movimentoCaixaSchema = z.object({
  tipo: z.enum(["sangria", "suprimento"]),
  valor: z.number({ error: "Informe o valor" }).positive("Informe um valor maior que zero").max(1_000_000),
  motivo: z.string().trim().min(3, "Informe o motivo").max(200, "Motivo muito longo (máx. 200)"),
});

const contado = z.number().min(0, "Valores contados não podem ser negativos").max(10_000_000);
export const fecharCaixaSchema = z.object({
  contados: z.object({
    dinheiro: contado, // obrigatório
    debito: contado.nullish(), // em branco = não conferido
    credito: contado.nullish(),
    pix: contado.nullish(),
  }),
  observacao: z.string().trim().max(200, "Observação muito longa (máx. 200)").nullish(),
});
