"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseValor } from "@/lib/format";
import { contarPendentesDoCaixa } from "@/lib/offline/armazem";

const input = "w-full rounded-lg border-2 border-gray-300 px-3 py-2 text-lg text-right outline-none focus:border-sky-500";

/** Fechamento "cego": a pessoa conta e informa; o esperado só aparece no relatório, depois de fechar. */
export default function FecharCaixa({ caixaId }: { caixaId: string }) {
  const router = useRouter();
  const [dinheiro, setDinheiro] = useState("");
  const [debito, setDebito] = useState("");
  const [credito, setCredito] = useState("");
  const [pix, setPix] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function fechar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const din = parseValor(dinheiro);
    if (din === null) {
      setErro("Conte o dinheiro do caixa e informe o valor (pode ser 0)");
      return;
    }
    // Venda feita sem internet ainda neste aparelho: fechar agora deixaria o relatório do caixa sem ela
    const pendentes = await contarPendentesDoCaixa(caixaId).catch(() => 0);
    if (pendentes > 0) {
      setErro(
        `Há ${pendentes} ${pendentes === 1 ? "venda feita sem internet aguardando envio" : "vendas feitas sem internet aguardando envio"} neste aparelho. ` +
          "Conecte à internet e envie antes de fechar o caixa (botão de vendas aguardando no rodapé do PDV).",
      );
      return;
    }
    if (!confirm("Fechar o caixa agora? Depois de fechado ele não pode ser reaberto.")) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/caixa/${caixaId}/fechar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contados: { dinheiro: din, debito: parseValor(debito), credito: parseValor(credito), pix: parseValor(pix) },
          observacao: obs,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Não foi possível fechar o caixa");
      router.push(`/caixa/${caixaId}`);
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível fechar o caixa");
      setEnviando(false);
    }
  }

  const campo = (rotulo: string, ajuda: string, valor: string, set: (v: string) => void, foco = false) => (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{rotulo}</span>
      <input value={valor} onChange={(e) => set(e.target.value)} inputMode="decimal" placeholder="0,00" autoFocus={foco} className={input} />
      <span className="text-xs text-gray-500">{ajuda}</span>
    </label>
  );

  return (
    <form onSubmit={fechar} className="space-y-3">
      <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
        Conte e informe o que você tem. O sistema compara com o que foi vendido e mostra a diferença no relatório.
      </p>
      {campo("Dinheiro contado na gaveta *", "Conte as notas e moedas (obrigatório)", dinheiro, setDinheiro, true)}
      {campo("Débito (total da maquininha)", "Deixe em branco se não for conferir", debito, setDebito)}
      {campo("Crédito (total da maquininha)", "Deixe em branco se não for conferir", credito, setCredito)}
      {campo("PIX (total recebido no banco)", "Deixe em branco se não for conferir", pix, setPix)}
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Observação</span>
        <input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 outline-none focus:border-sky-500" />
      </label>
      {erro && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}
      <button disabled={enviando} className="w-full rounded-lg bg-red-600 py-3 text-lg font-bold text-white disabled:opacity-50">
        {enviando ? "Fechando..." : "Fechar caixa"}
      </button>
    </form>
  );
}
