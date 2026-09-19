"use client";

import { useEffect, useRef, useState } from "react";
import type { FotoPendente } from "@/lib/importacao/tipos";

const POR_LOTE = 8;

type Falha = { foto: FotoPendente; motivo: string };

/** Baixa as fotos da importação, em lotes, mostrando o andamento. Só recomeça as que falharam se a pessoa pedir. */
export default function ProgressoFotos({ fotos, substituir }: { fotos: FotoPendente[]; substituir: boolean }) {
  const [feitas, setFeitas] = useState(0);
  const [novas, setNovas] = useState(0);
  const [mantidas, setMantidas] = useState(0);
  const [falhas, setFalhas] = useState<Falha[]>([]);
  const [rodando, setRodando] = useState(false);
  const [total, setTotal] = useState(fotos.length);
  const pararRef = useRef(false);
  const iniciou = useRef(false);

  async function enviarLote(lote: FotoPendente[]): Promise<Falha[]> {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        const res = await fetch("/api/produtos/imagens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itens: lote.map((f) => ({ produto_id: f.produto_id, url: f.url })), substituir }),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) return lote.map((foto) => ({ foto, motivo: j?.error ?? `Erro ${res.status}` }));
        const resultados = j.resultados as { produto_id: string; status: "ok" | "mantida" | "erro"; erro?: string }[];
        const erros: Falha[] = [];
        let ok = 0;
        let man = 0;
        for (const f of lote) {
          const r = resultados.find((x) => x.produto_id === f.produto_id);
          if (r?.status === "ok") ok++;
          else if (r?.status === "mantida") man++;
          else erros.push({ foto: f, motivo: r?.erro ?? "Sem resposta do servidor" });
        }
        setNovas((n) => n + ok);
        setMantidas((n) => n + man);
        return erros;
      } catch {
        await new Promise((r) => setTimeout(r, 1500)); // uma segunda chance para queda rápida de rede
      }
    }
    return lote.map((foto) => ({ foto, motivo: "Falha de conexão com o servidor" }));
  }

  async function processar(lista: FotoPendente[]) {
    pararRef.current = false;
    setRodando(true);
    setTotal(lista.length);
    setFeitas(0);
    setNovas(0);
    setMantidas(0);
    setFalhas([]);
    const acumuladas: Falha[] = [];
    for (let i = 0; i < lista.length; i += POR_LOTE) {
      if (pararRef.current) {
        acumuladas.push(...lista.slice(i).map((foto) => ({ foto, motivo: "Interrompida (importe de novo para continuar)" })));
        break;
      }
      const lote = lista.slice(i, i + POR_LOTE);
      acumuladas.push(...(await enviarLote(lote)));
      setFeitas(Math.min(i + POR_LOTE, lista.length));
      setFalhas([...acumuladas]);
    }
    setRodando(false);
  }

  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;
    const t = setTimeout(() => void processar(fotos), 0);
    return () => clearTimeout(t);
    // roda uma vez, quando a importação termina
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = total ? Math.round((feitas / total) * 100) : 100;
  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-1 font-semibold">Fotos dos produtos</h3>
      <div className="mb-2 h-3 overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-gray-700">
        {rodando ? `Baixando… ${feitas} de ${total} (deixe esta página aberta)` : `Terminou: ${feitas} de ${total}`}
        {" · "}
        {novas} novas
        {mantidas > 0 ? ` · ${mantidas} já tinham foto` : ""}
        {falhas.length > 0 ? ` · ${falhas.length} com problema` : ""}
      </p>
      {rodando && (
        <button onClick={() => (pararRef.current = true)} className="mt-2 text-sm text-red-600 hover:underline">
          Parar
        </button>
      )}
      {falhas.length > 0 && !rodando && (
        <div className="mt-3">
          <p className="mb-1 text-sm font-medium text-red-800">Fotos que não entraram</p>
          <div className="max-h-56 overflow-auto rounded-lg border border-red-200">
            <table className="w-full text-sm">
              <thead className="bg-red-50 text-left">
                <tr><th className="p-2">Linha</th><th className="p-2">Produto</th><th className="p-2">Motivo</th></tr>
              </thead>
              <tbody>
                {falhas.map((f) => (
                  <tr key={f.foto.produto_id} className="border-t border-red-100">
                    <td className="p-2">{f.foto.linha}</td>
                    <td className="p-2">{f.foto.nome}</td>
                    <td className="p-2">{f.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => void processar(falhas.map((f) => f.foto))} className="mt-2 rounded-lg border border-brand px-3 py-1 text-sm font-medium text-brand">
            Tentar de novo as que falharam
          </button>
        </div>
      )}
    </div>
  );
}
