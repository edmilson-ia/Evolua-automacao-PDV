"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ProdutoMov = { id: string; nome: string; sku: string; quantidade: number; unidade: string; preco_custo: number };
type Tipo = "entrada" | "saida" | "ajuste";

const TIPOS: { id: Tipo; titulo: string; ajuda: string; cor: string }[] = [
  { id: "entrada", titulo: "Entrada", ajuda: "Compra, devolução de cliente...", cor: "bg-emerald-600" },
  { id: "saida", titulo: "Saída", ajuda: "Perda, quebra, consumo próprio...", cor: "bg-red-600" },
  { id: "ajuste", titulo: "Ajuste (inventário)", ajuda: "Informe a contagem real", cor: "bg-amber-600" },
];

const MOTIVOS: Record<Tipo, string[]> = {
  entrada: ["Compra de fornecedor", "Devolução de cliente", "Bonificação"],
  saida: ["Perda / quebra", "Vencido", "Consumo próprio", "Devolução ao fornecedor"],
  ajuste: ["Inventário mensal", "Correção de contagem"],
};

const num = (s: string) => Number(s.replace(",", ".")) || 0;
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export default function FormMovimento({ produtos }: { produtos: ProdutoMov[] }) {
  const router = useRouter();
  const [produtoId, setProdutoId] = useState("");
  const [tipo, setTipo] = useState<Tipo>("entrada");
  const [qtd, setQtd] = useState("");
  const [motivo, setMotivo] = useState("");
  const [custo, setCusto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  const produto = produtos.find((p) => p.id === produtoId);
  const q = num(qtd);
  const novo = !produto || qtd === "" ? null : tipo === "entrada" ? produto.quantidade + q : tipo === "saida" ? produto.quantidade - q : q;
  const excede = tipo === "saida" && !!produto && q > produto.quantidade;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setOk("");
    setEnviando(true);
    try {
      const res = await fetch("/api/movimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produto_id: produtoId,
          tipo,
          quantidade: q,
          motivo: motivo || null,
          preco_custo: tipo === "entrada" && custo !== "" ? num(custo) : null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Não foi possível registrar");
      setOk(`Registrado! Estoque de ${produto?.nome.trim()}: ${fmt(j.quantidade_anterior)} → ${fmt(j.quantidade_nova)} ${produto?.unidade}`);
      setQtd("");
      setMotivo("");
      setCusto("");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível registrar");
    } finally {
      setEnviando(false);
    }
  }

  const input = "w-full rounded-lg border border-gray-300 px-3 py-2";
  const label = "mb-1 block text-sm font-medium text-gray-700";

  return (
    <form onSubmit={enviar} className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-lg font-bold">Novo movimento</h2>

      <div className="mb-3 grid grid-cols-3 gap-2">
        {TIPOS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTipo(t.id)}
            className={`rounded-lg border-2 px-2 py-2 text-left ${
              tipo === t.id ? `${t.cor} border-transparent text-white` : "border-gray-300 bg-white"
            }`}
          >
            <div className="text-sm font-semibold sm:text-base">{t.titulo}</div>
            <div className={`hidden text-xs sm:block ${tipo === t.id ? "text-white/80" : "text-gray-500"}`}>{t.ajuda}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label}>Produto</label>
          <select required value={produtoId} onChange={(e) => setProdutoId(e.target.value)} className={input}>
            <option value="">Selecione o produto...</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome.trim()} · SKU {p.sku} · estoque {fmt(p.quantidade)} {p.unidade}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={label}>
            {tipo === "entrada" ? "Quantidade que entrou" : tipo === "saida" ? "Quantidade que saiu" : "Contagem real (o que existe na prateleira)"}
            {produto && ` (${produto.unidade})`}
          </label>
          <input
            required
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
            inputMode="decimal"
            className={`${input} ${excede ? "border-red-500 bg-red-50" : ""}`}
          />
          {produto && novo !== null && (
            <p className={`mt-1 text-sm ${excede ? "font-semibold text-red-700" : "text-gray-600"}`}>
              {excede
                ? `Só há ${fmt(produto.quantidade)} ${produto.unidade} em estoque`
                : `Estoque: ${fmt(produto.quantidade)} → ${fmt(novo)} ${produto.unidade}`}
            </p>
          )}
        </div>

        <div>
          <label className={label}>Motivo (opcional)</label>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} list="motivos" maxLength={200} className={input} />
          <datalist id="motivos">
            {MOTIVOS[tipo].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>

        {tipo === "entrada" && (
          <div>
            <label className={label}>Novo preço de custo unitário (opcional)</label>
            <input
              value={custo}
              onChange={(e) => setCusto(e.target.value)}
              inputMode="decimal"
              placeholder={produto ? `Atual: R$ ${produto.preco_custo.toFixed(2).replace(".", ",")}` : ""}
              className={input}
            />
          </div>
        )}
      </div>

      {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
      {ok && <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">✔ {ok}</p>}

      <button
        disabled={enviando || !produtoId || qtd === "" || excede}
        className="mt-4 rounded-lg bg-brand px-6 py-2.5 font-semibold text-white disabled:opacity-40"
      >
        {enviando ? "Registrando..." : "Registrar movimento"}
      </button>
    </form>
  );
}
