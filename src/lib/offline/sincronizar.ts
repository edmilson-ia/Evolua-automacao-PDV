import { atualizarNaFila, listarFila, removerDaFila } from "./armazem";

export type ResultadoEnvio = {
  enviadas: number;
  /** Vendas que continuam aguardando (sem rede, sem sessão ou sem caixa aberto). */
  aguardando: number;
  /** Vendas que o servidor recusou e precisam de decisão de uma pessoa. */
  problemas: number;
  semSessao: boolean;
  semRede: boolean;
};

/** fetch que desiste depois de `ms` (rede "meio morta" não pode travar a fila nem o PDV). */
export async function fetchComTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controle = new AbortController();
  const t = setTimeout(() => controle.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controle.signal });
  } finally {
    clearTimeout(t);
  }
}

let rodando = false;

/**
 * Envia, uma por vez e na ordem, as vendas guardadas deste operador. É seguro repetir e rodar em duas abas:
 * a chave de cada venda faz o servidor devolver a venda que já existe em vez de gravar outra.
 */
export async function enviarFila(tenantId: string, operadorId: string): Promise<ResultadoEnvio> {
  const r: ResultadoEnvio = { enviadas: 0, aguardando: 0, problemas: 0, semSessao: false, semRede: false };
  if (rodando) return r;
  rodando = true;
  try {
    const fila = await listarFila(tenantId, operadorId);
    r.problemas = fila.filter((v) => v.estado === "problema").length;
    const pendentes = fila.filter((v) => v.estado === "pendente");
    r.aguardando = pendentes.length;

    for (const venda of pendentes) {
      let res: Response;
      try {
        res = await fetchComTimeout(
          "/api/vendas",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...venda.corpo, chave: venda.chave, offline: true, criado_em: venda.criadoEm }),
          },
          15000,
        );
      } catch {
        r.semRede = true;
        break;
      }
      if (res.ok) {
        await removerDaFila(venda.chave);
        r.enviadas++;
        r.aguardando--;
        continue;
      }
      const erro = ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Erro ${res.status}`;
      if (res.status === 401 || res.status === 403) {
        r.semSessao = true;
        break;
      }
      if (res.status >= 500 || res.status === 408 || res.status === 429) {
        r.semRede = true; // servidor indisponível: tenta de novo mais tarde
        break;
      }
      if (/Abra o caixa/i.test(erro)) {
        // Não é defeito da venda: assim que o operador abrir o caixa ela entra
        await atualizarNaFila({ ...venda, erro });
        break;
      }
      await atualizarNaFila({ ...venda, estado: "problema", erro });
      r.aguardando--;
      r.problemas++;
    }
    return r;
  } finally {
    rodando = false;
  }
}
