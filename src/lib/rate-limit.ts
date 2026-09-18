// Freio simples contra tentativa de adivinhar senha (em memória: vale para 1 instância, como na VPS).
const MAX_FALHAS = 5;
const JANELA_MS = 15 * 60 * 1000;
const BLOQUEIO_MS = 60 * 1000;

const falhas = new Map<string, { n: number; desde: number; ate: number }>();

/** Segundos restantes de bloqueio (0 = liberado). */
export function segundosBloqueado(chave: string): number {
  const e = falhas.get(chave);
  if (!e || e.ate <= Date.now()) return 0;
  return Math.ceil((e.ate - Date.now()) / 1000);
}

export function registrarFalha(chave: string): void {
  const agora = Date.now();
  const e = falhas.get(chave);
  const atual = e && agora - e.desde < JANELA_MS ? e : { n: 0, desde: agora, ate: 0 };
  atual.n += 1;
  if (atual.n >= MAX_FALHAS) atual.ate = agora + BLOQUEIO_MS;
  falhas.set(chave, atual);
}

export function limparFalhas(chave: string): void {
  falhas.delete(chave);
}
