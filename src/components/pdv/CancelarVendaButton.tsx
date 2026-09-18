"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { brl } from "@/lib/format";

const MOTIVOS = ["Erro de digitação", "Cliente desistiu", "Produto errado", "Pagamento não aprovado"];

export default function CancelarVendaButton({ vendaId, total }: { vendaId: string; total: number }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function cancelar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const res = await fetch(`/api/vendas/${vendaId}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "Não foi possível cancelar a venda");
      }
      setAberto(false);
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível cancelar a venda");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        Cancelar venda
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
          <form onSubmit={cancelar} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="mb-1 text-lg font-bold text-red-700">Cancelar esta venda?</h2>
            <p className="mb-3 text-sm text-gray-600">
              Os produtos voltam ao estoque e a venda de <strong>{brl(total)}</strong> sai dos totais. Isso não pode ser desfeito.{" "}
              <strong>O estorno do dinheiro/cartão/PIX ao cliente é feito fora do sistema.</strong>
            </p>

            <label className="mb-1 block text-sm font-medium text-gray-700">Motivo (obrigatório)</label>
            <input
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              list="motivos-cancelamento"
              maxLength={200}
              required
              minLength={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
            <datalist id="motivos-cancelamento">
              {MOTIVOS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>

            {erro && <p className="mt-3 rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{erro}</p>}

            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setAberto(false)} className="flex-1 rounded-lg border border-gray-300 py-2 font-medium">
                Voltar
              </button>
              <button disabled={enviando} className="flex-1 rounded-lg bg-red-600 py-2 font-semibold text-white disabled:opacity-50">
                {enviando ? "Cancelando..." : "Confirmar cancelamento"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
