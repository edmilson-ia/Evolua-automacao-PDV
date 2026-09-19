"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { brl } from "@/lib/format";
import type { Produto } from "@/types/produto";
import ExcluirProdutoButton from "./ExcluirProdutoButton";

const POR_CHAMADA = 200;

/** Lista do Estoque com seleção: marcar vários produtos (ou todos com estoque 0) e excluir de uma vez. */
export default function TabelaEstoque({ produtos }: { produtos: Produto[] }) {
  const router = useRouter();
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState("");

  const semEstoque = useMemo(() => produtos.filter((p) => Number(p.quantidade) === 0), [produtos]);
  const todosMarcados = produtos.length > 0 && produtos.every((p) => marcados.has(p.id));

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (!novo.delete(id)) novo.add(id);
      return novo;
    });
  }

  async function excluirMarcados() {
    const ids = [...marcados];
    const nomes = produtos.filter((p) => marcados.has(p.id)).slice(0, 5).map((p) => p.nome.trim());
    const exemplo = nomes.length ? `\n\nEx.: ${nomes.join(", ")}${ids.length > nomes.length ? "…" : ""}` : "";
    if (!confirm(`Excluir ${ids.length} ${ids.length === 1 ? "produto" : "produtos"}? Eles saem das listas; o histórico de vendas é mantido.${exemplo}`)) return;
    setExcluindo(true);
    setErro("");
    let feitos = 0;
    try {
      for (let i = 0; i < ids.length; i += POR_CHAMADA) {
        const res = await fetch("/api/produtos/excluir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: ids.slice(i, i + POR_CHAMADA) }),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(j?.error ?? "Não foi possível excluir");
        feitos += j.excluidos ?? 0;
      }
      setMarcados(new Set());
      router.refresh();
    } catch (e) {
      setErro(`${e instanceof Error ? e.message : "Erro inesperado"}${feitos ? ` (${feitos} já foram excluídos)` : ""}`);
      router.refresh();
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <button
          onClick={() => setMarcados(new Set(semEstoque.map((p) => p.id)))}
          disabled={semEstoque.length === 0 || excluindo}
          className="rounded-lg border border-gray-300 px-3 py-1.5 font-medium disabled:opacity-50"
        >
          Selecionar todos com estoque 0 ({semEstoque.length})
        </button>
        {marcados.size > 0 && (
          <>
            <button onClick={() => setMarcados(new Set())} disabled={excluindo} className="rounded-lg border border-gray-300 px-3 py-1.5">
              Limpar seleção
            </button>
            <button onClick={excluirMarcados} disabled={excluindo} className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white disabled:opacity-60">
              {excluindo ? "Excluindo…" : `Excluir selecionados (${marcados.size})`}
            </button>
          </>
        )}
      </div>
      {erro && <div role="alert" className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="w-10 p-3">
                <input
                  type="checkbox"
                  aria-label="Selecionar todos os produtos da lista"
                  checked={todosMarcados}
                  onChange={() => setMarcados(todosMarcados ? new Set() : new Set(produtos.map((p) => p.id)))}
                />
              </th>
              <th className="p-3">Produto</th>
              <th className="p-3">SKU</th>
              <th className="p-3 text-right">Custo</th>
              <th className="p-3 text-right">Venda</th>
              <th className="p-3 text-right">Qtd</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {produtos.map((p) => (
              <tr key={p.id} className={`border-t border-gray-100 ${marcados.has(p.id) ? "bg-red-50" : ""}`}>
                <td className="p-3">
                  <input type="checkbox" aria-label={`Selecionar ${p.nome}`} checked={marcados.has(p.id)} onChange={() => alternar(p.id)} />
                </td>
                <td className="p-3 font-medium">
                  <div className="flex items-center gap-3">
                    {p.imagem_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imagem_url} alt="" className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded bg-gray-100 text-gray-400">
                        {p.nome.charAt(0).toUpperCase()}
                      </span>
                    )}
                    {p.nome}
                  </div>
                </td>
                <td className="p-3">
                  {p.sku}
                  {p.codigo_barras && <div className="text-xs text-gray-500">{p.codigo_barras}</div>}
                </td>
                <td className="p-3 text-right">{brl(p.preco_custo)}</td>
                <td className="p-3 text-right">{brl(p.preco_venda)}</td>
                <td className={`p-3 text-right ${p.quantidade <= p.estoque_minimo ? "font-semibold text-red-600" : ""}`}>
                  {p.quantidade} {p.unidade}
                </td>
                <td className="space-x-3 whitespace-nowrap p-3 text-right">
                  <Link href={`/estoque/${p.id}`} className="text-brand hover:underline">Editar</Link>
                  <ExcluirProdutoButton id={p.id} nome={p.nome} />
                </td>
              </tr>
            ))}
            {produtos.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-gray-500">Nenhum produto cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
