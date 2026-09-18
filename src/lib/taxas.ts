import type { FormaPagamento } from "@/types/venda";

// Taxas cobradas pela maquininha/adquirente. Só débito e crédito têm taxa;
// dinheiro e PIX entram pelo valor cheio.
// Ficam aqui por enquanto; no multi-tenant passam a ser configuráveis por cliente.
export const TAXAS_CARTAO: Partial<Record<FormaPagamento, number>> = {
  debito: 2.0, // %
  credito: 3.5, // %
};

export type Liquido = {
  /** Percentual aplicado (0 quando a forma não tem taxa). */
  taxaPct: number;
  /** Valor descontado, em reais. */
  taxa: number;
  /** Valor que realmente entra: total − taxa. */
  liquido: number;
};

export function calcularLiquido(forma: FormaPagamento, total: number): Liquido {
  const taxaPct = TAXAS_CARTAO[forma] ?? 0;
  // Arredonda em centavos para os totais baterem com o extrato
  const taxa = Math.round(total * taxaPct) / 100;
  return { taxaPct, taxa, liquido: Math.round((total - taxa) * 100) / 100 };
}

export const pctBR = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "%";
