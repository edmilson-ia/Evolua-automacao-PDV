"use client";

import { brl, dataHoraBR } from "@/lib/format";
import type { VendaPendente } from "@/lib/offline/armazem";

/** Vendas feitas sem internet que ainda não chegaram ao servidor: enviar agora ou (com confirmação) descartar. */
export default function PendentesOffline({
  fila,
  enviando,
  semSessao,
  online,
  onEnviar,
  onDescartar,
  onFechar,
}: {
  fila: VendaPendente[];
  enviando: boolean;
  semSessao: boolean;
  online: boolean;
  onEnviar: () => void;
  onDescartar: (chave: string) => void;
  onFechar: () => void;
}) {
  function descartar(v: VendaPendente) {
    const texto =
      `Descartar esta venda de ${brl(Number(v.venda.total))}? Ela NÃO será registrada no sistema, ` +
      "o estoque e o caixa não serão alterados. Só faça isso se a venda não aconteceu ou já foi lançada de outro jeito.";
    if (confirm(texto)) onDescartar(v.chave);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Vendas aguardando envio</h2>
          <button onClick={onFechar} className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100" aria-label="Fechar">✕</button>
        </div>

        {semSessao && (
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Sua sessão expirou. Entre de novo no sistema: as vendas guardadas são enviadas em seguida.
          </p>
        )}
        {!online && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">Sem internet no momento. O envio é automático quando ela voltar.</p>}
        {fila.length === 0 && <p className="text-sm text-gray-500">Nenhuma venda guardada.</p>}

        <ul className="space-y-2">
          {fila.map((v) => (
            <li key={v.chave} className={`rounded-lg border p-3 text-sm ${v.estado === "problema" ? "border-red-300 bg-red-50" : "border-gray-200"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{brl(Number(v.venda.total))}</span>
                <span className="text-xs text-gray-500">{dataHoraBR(v.criadoEm)}</span>
              </div>
              <div className="text-xs text-gray-600">
                {v.venda.itens_venda.map((i) => `${Number(i.quantidade)}x ${i.produtos?.nome ?? "Produto"}`).join(", ")}
              </div>
              {v.erro && (
                <p className={`mt-1 text-xs ${v.estado === "problema" ? "font-medium text-red-700" : "text-amber-800"}`}>
                  {v.estado === "problema" ? "O sistema recusou: " : "Aguardando: "}
                  {v.erro}
                </p>
              )}
              <div className="mt-2 text-right">
                <button onClick={() => descartar(v)} className="text-xs text-red-600 hover:underline">Descartar</button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onEnviar}
            disabled={enviando || !fila.some((v) => v.estado === "pendente")}
            className="flex-1 rounded-lg bg-emerald-600 py-2 font-semibold text-white disabled:opacity-50"
          >
            {enviando ? "Enviando…" : "Enviar agora"}
          </button>
          <button onClick={onFechar} className="flex-1 rounded-lg border border-gray-300 py-2 font-medium">Fechar</button>
        </div>
      </div>
    </div>
  );
}
