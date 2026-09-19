export const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export const dataHoraBR = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Data de hoje (YYYY-MM-DD) no fuso de São Paulo. */
export function hojeSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Intervalo [inicio, fim) em ISO para um dia (YYYY-MM-DD) no fuso de São Paulo (UTC-3, sem horário de verão). */
export function dayRangeSP(data?: string | null) {
  const dia = data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : hojeSP();
  const inicio = new Date(`${dia}T00:00:00-03:00`);
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  return { dia, inicio: inicio.toISOString(), fim: fim.toISOString() };
}

/** Texto de um campo de valor ("1.250,50", "12,5" ou "12.5") → número. Em branco ou inválido = null. */
export function parseValor(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  // Com vírgula, o ponto é separador de milhar ("1.250,50"); sem vírgula, o ponto é decimal ("12.5")
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}
