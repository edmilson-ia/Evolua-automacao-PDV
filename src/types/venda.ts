export type FormaPagamento = "dinheiro" | "debito" | "credito" | "pix" | "cartao";

export type ItemVenda = {
  id: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
  produtos: { nome: string; unidade: string } | null;
};

export type Venda = {
  id: string;
  total: number;
  desconto: number;
  forma_pagamento: FormaPagamento;
  valor_recebido: number | null;
  troco: number | null;
  status: string;
  criado_em: string;
  /** Quem vendeu (nulo nas vendas anteriores à migration 0005). */
  operador_id?: string | null;
  operador_nome?: string | null;
  /** Cliente da venda e dados da entrega (copiados na hora da venda; nulos nas vendas sem cliente). */
  cliente_id?: string | null;
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
  entrega?: boolean;
  entrega_endereco?: string | null;
  /** Venda feita sem internet e enviada depois (migration 0010). */
  offline?: boolean;
  /** Preenchidos quando a venda é cancelada (migration 0004). */
  cancelada_em?: string | null;
  motivo_cancelamento?: string | null;
  cancelada_por?: string | null;
  itens_venda: ItemVenda[];
};

export const FORMA_LABEL: Record<FormaPagamento, string> = {
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  pix: "PIX",
  cartao: "Cartão", // legado: vendas anteriores à separação débito/crédito
};

/** Formas oferecidas no PDV (ordem de exibição). */
export const FORMAS_PDV: FormaPagamento[] = ["dinheiro", "debito", "credito", "pix"];
