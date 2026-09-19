"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Produto } from "@/types/produto";
import { guardarCatalogo, listarFila, removerDaFila, type VendaPendente } from "@/lib/offline/armazem";
import { enviarFila, fetchComTimeout } from "@/lib/offline/sincronizar";

const A_CADA_ENVIO_MS = 30_000;
const A_CADA_CATALOGO_MS = 5 * 60_000;

/**
 * Cuida do modo sem internet do PDV: baixa a cópia do catálogo, envia sozinho as vendas guardadas quando a
 * internet volta e expõe a lista para a tela. Erros de armazenamento local nunca derrubam o PDV.
 */
export function useVendasOffline(tenantId: string, operadorId: string, online: boolean) {
  const [fila, setFila] = useState<VendaPendente[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [semSessao, setSemSessao] = useState(false);
  const vivo = useRef(true);

  const recarregar = useCallback(async () => {
    try {
      const f = await listarFila(tenantId, operadorId);
      if (vivo.current) setFila(f);
    } catch {
      /* sem armazenamento local: o PDV só funciona com internet */
    }
  }, [tenantId, operadorId]);

  const baixarCatalogo = useCallback(async () => {
    try {
      const res = await fetchComTimeout("/api/produtos", {}, 15000);
      if (res.ok) await guardarCatalogo(tenantId, (await res.json()) as Produto[]);
    } catch {
      /* sem internet ou sem armazenamento: continua com a cópia que já existe */
    }
  }, [tenantId]);

  const enviarAgora = useCallback(async () => {
    setEnviando(true);
    try {
      const r = await enviarFila(tenantId, operadorId);
      if (vivo.current) setSemSessao(r.semSessao);
      if (r.enviadas > 0) void baixarCatalogo(); // o estoque do servidor mudou
    } catch {
      /* armazenamento indisponível */
    } finally {
      if (vivo.current) setEnviando(false);
      await recarregar();
    }
  }, [tenantId, operadorId, baixarCatalogo, recarregar]);

  const descartar = useCallback(
    async (chave: string) => {
      try {
        await removerDaFila(chave);
      } finally {
        await recarregar();
      }
    },
    [recarregar],
  );

  useEffect(() => {
    vivo.current = true;
    const t = setTimeout(() => void recarregar(), 0);
    return () => {
      clearTimeout(t);
      vivo.current = false;
    };
  }, [recarregar]);

  // Quando a internet está de pé: baixa o catálogo, envia a fila e repete de tempos em tempos
  useEffect(() => {
    if (!online) return;
    const inicio = setTimeout(() => {
      void baixarCatalogo();
      void enviarAgora();
    }, 0);
    const envio = setInterval(() => void enviarAgora(), A_CADA_ENVIO_MS);
    const catalogo = setInterval(() => void baixarCatalogo(), A_CADA_CATALOGO_MS);
    return () => {
      clearTimeout(inicio);
      clearInterval(envio);
      clearInterval(catalogo);
    };
  }, [online, baixarCatalogo, enviarAgora]);

  return { fila, enviando, semSessao, recarregar, enviarAgora, descartar, baixarCatalogo };
}
