let contexto: AudioContext | null = null;

/** Bipe curto de confirmação (agudo) ou de erro (grave e mais longo). Nunca falha: sem som, segue em silêncio. */
export function tocarBeep(tipo: "ok" | "erro") {
  try {
    contexto ??= new AudioContext();
    const osc = contexto.createOscillator();
    const ganho = contexto.createGain();
    osc.frequency.value = tipo === "ok" ? 1400 : 300;
    ganho.gain.value = 0.08;
    osc.connect(ganho).connect(contexto.destination);
    osc.start();
    osc.stop(contexto.currentTime + (tipo === "ok" ? 0.08 : 0.3));
  } catch {
    /* navegador sem áudio ou bloqueado: ignora */
  }
}
