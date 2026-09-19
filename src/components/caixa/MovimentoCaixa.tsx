"use client";

import { useState } from "react";
import { parseValor } from "@/lib/format";

const MOTIVOS = { sangria: ["Depósito no banco", "Pagamento a fornecedor", "Retirada do dono"], suprimento: ["Troco inicial extra", "Reforço de caixa"] };
const input = "w-full rounded-lg border-2 border-gray-300 px-3 py-2.5 text-lg outline-none focus:border-sky-500";

export default function MovimentoCaixa({ caixaId, onConcluido }: { caixaId: string; onConcluido: () => void }) {
  const [tipo, setTipo] = useState<"sangria" | "suprimento">("sangria");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const v = parseValor(valor);
    if (v === null) {
      setErro("Informe o valor");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch(`/api/caixa/${caixaId}/movimentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, valor: v, motivo }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Não foi possível registrar");
      onConcluido();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível registrar");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(["sangria", "suprimento"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(t)}
            className={`rounded-lg border-2 py-2.5 font-semibold ${tipo === t ? "border-transparent bg-sky-600 text-white" : "border-gray-300"}`}
          >
            {t === "sangria" ? "Sangria (tirar)" : "Suprimento (colocar)"}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Valor</span>
        <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" autoFocus className={`${input} text-right`} />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Motivo</span>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} required className={input} />
        <span className="mt-1 flex flex-wrap gap-1">
          {MOTIVOS[tipo].map((m) => (
            <button key={m} type="button" onClick={() => setMotivo(m)} className="rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50">
              {m}
            </button>
          ))}
        </span>
      </label>
      {erro && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}
      <button disabled={enviando} className="w-full rounded-lg bg-sky-600 py-3 text-lg font-bold text-white disabled:opacity-50">
        {enviando ? "Registrando..." : tipo === "sangria" ? "Registrar sangria" : "Registrar suprimento"}
      </button>
    </form>
  );
}
