/**
 * Período de teste grátis das lojas (tenants.teste_ate). Vazio = loja definitiva. Funções puras, sem banco.
 * O teste vale até o FIM do último dia (23:59:59, horário de São Paulo, que não tem horário de verão: UTC-3).
 */
const DIA_MS = 24 * 60 * 60 * 1000;

/** Dia (YYYY-MM-DD) no fuso de São Paulo. */
const diaSP = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Fim do dia de `data` em São Paulo. */
function fimDoDia(data: Date): Date {
  return new Date(`${diaSP(data)}T23:59:59-03:00`);
}

/** Fim de um teste de `dias` dias contando HOJE como o 1º (7 dias = hoje + 6, até 23:59:59). */
export function fimDoTeste(dias: number, agora: Date = new Date()): Date {
  return fimDoDia(new Date(agora.getTime() + (dias - 1) * DIA_MS));
}

/** Prorrogação: soma `dias` ao fim atual; se o teste já tinha vencido, conta `dias` dias a partir de hoje. */
export function prorrogarTeste(testeAte: string | Date, dias: number, agora: Date = new Date()): Date {
  const atual = new Date(testeAte);
  if (atual.getTime() <= agora.getTime()) return fimDoTeste(dias, agora);
  return fimDoDia(new Date(atual.getTime() + dias * DIA_MS));
}

export type EstadoTeste =
  | { modo: "definitiva" }
  | { modo: "teste"; diasRestantes: number; venceEm: Date }
  | { modo: "vencido"; venceEm: Date };

export function estadoDoTeste(testeAte: string | Date | null | undefined, agora: Date = new Date()): EstadoTeste {
  if (!testeAte) return { modo: "definitiva" };
  const venceEm = new Date(testeAte);
  if (venceEm.getTime() <= agora.getTime()) return { modo: "vencido", venceEm };
  // 1 = vence hoje; conta dias de calendário (São Paulo), não blocos de 24 h
  const diasRestantes = Math.round((new Date(`${diaSP(venceEm)}T12:00:00-03:00`).getTime() - new Date(`${diaSP(agora)}T12:00:00-03:00`).getTime()) / DIA_MS) + 1;
  return { modo: "teste", diasRestantes, venceEm };
}

/** "14/10/2026" no fuso de São Paulo. */
export const dataBR = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
