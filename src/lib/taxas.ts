import type { FormaPagamento } from "@/types/venda";

// Taxas cobradas pela maquininha/adquirente, em % — configuradas por loja (tenants.taxa_debito/credito).
// Só débito e crédito têm taxa; dinheiro e PIX entram pelo valor cheio.
export type TaxasCartao = { debito: number; credito: number };

export type Liquido = {
  /** Percentual aplicado (0 quando a forma não tem taxa). */
  taxaPct: number;
  /** Valor descontado, em reais. */
  taxa: number;
  /** Valor que realmente entra: total − taxa. */
  liquido: number;
};

export function calcularLiquido(forma: FormaPagamento, total: number, taxas: TaxasCartao): Liquido {
  const taxaPct = forma === "debito" ? taxas.debito : forma === "credito" ? taxas.credito : 0;
  // Arredonda em centavos para os totais baterem com o extrato
  const taxa = Math.round(total * taxaPct) / 100;
  return { taxaPct, taxa, liquido: Math.round((total - taxa) * 100) / 100 };
}

export const pctBR = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "%";
