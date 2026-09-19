"use client";

import { useState } from "react";
import { parseValor } from "@/lib/format";

const CHAVE_TERMINAL = "evolua_terminal";
const input = "w-full rounded-lg border-2 border-gray-300 px-3 py-2.5 text-lg outline-none focus:border-sky-500";

/** Terminal usado por último neste aparelho (só conveniência: se o navegador bloquear, começa em "Caixa 1"). */
function terminalLembrado(): string {
  try {
    return localStorage.getItem(CHAVE_TERMINAL) || "Caixa 1";
  } catch {
    return "Caixa 1";
  }
}

export default function AbrirCaixa({ onAberto, obrigatorio }: { onAberto: () => void; obrigatorio: boolean }) {
  const [terminal, setTerminal] = useState(terminalLembrado);
  const [inicial, setInicial] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function abrir(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const valor = parseValor(inicial);
    if (valor === null) {
      setErro("Informe o dinheiro que está no caixa (pode ser 0)");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/caixa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminal, valor_inicial: valor }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Não foi possível abrir o caixa");
      try {
        localStorage.setItem(CHAVE_TERMINAL, terminal.trim());
      } catch {
        /* sem armazenamento local: só não lembra o terminal */
      }
      onAberto();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível abrir o caixa");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={abrir} className="space-y-4">
      {obrigatorio && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Esta loja exige o caixa aberto para vender.</p>
      )}
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Terminal</span>
        <input value={terminal} onChange={(e) => setTerminal(e.target.value)} maxLength={30} required className={input} />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Dinheiro no caixa agora (valor inicial)</span>
        <input
          value={inicial}
          onChange={(e) => setInicial(e.target.value)}
          inputMode="decimal"
          placeholder="0,00"
          autoFocus
          className={`${input} text-right`}
        />
      </label>
      {erro && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}
      <button disabled={enviando} className="w-full rounded-lg bg-emerald-600 py-3 text-lg font-bold text-white disabled:opacity-50">
        {enviando ? "Abrindo..." : "Abrir caixa"}
      </button>
    </form>
  );
}
