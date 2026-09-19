import Link from "next/link";
import { exigirPagina } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { gruposRepetidos } from "@/lib/repetidos";
import type { Produto } from "@/types/produto";
import TabelaEstoque from "@/components/estoque/TabelaEstoque";

export const dynamic = "force-dynamic";

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sessao = await exigirPagina(["admin"]);
  const { q } = await searchParams;
  let query = createServerClient()
    .from("produtos")
    .select("*")
    .eq("tenant_id", sessao.tenantId)
    .eq("ativo", true)
    .order("nome");
  if (q) query = query.or(`nome.ilike.%${q}%,sku.ilike.%${q}%,codigo_barras.ilike.%${q}%`);
  const { data } = await query;
  const produtos = (data ?? []) as Produto[];
  const grupos = await gruposRepetidos(createServerClient(), sessao.tenantId);
  // Estoque negativo = venda feita sem internet de produto que já tinha acabado: precisa de conferência
  const { data: negativos } = await createServerClient()
    .from("produtos")
    .select("id, nome, quantidade, unidade")
    .eq("tenant_id", sessao.tenantId)
    .eq("ativo", true)
    .lt("quantidade", 0)
    .order("quantidade")
    .limit(50);
  const baixos = produtos.filter((p) => p.quantidade <= p.estoque_minimo);

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">Estoque</h1>
        <div className="flex gap-2">
          <Link href="/estoque/movimentos" className="rounded-lg border border-brand px-4 py-2 font-medium text-brand">
            Movimentar estoque
          </Link>
          <Link href="/estoque/importar" className="rounded-lg border border-brand px-4 py-2 font-medium text-brand">
            Importar planilha
          </Link>
          <Link href="/estoque/novo" className="rounded-lg bg-brand px-4 py-2 text-white font-medium">
            + Novo produto
          </Link>
        </div>
      </div>

      {(negativos?.length ?? 0) > 0 && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <strong>Estoque negativo ({negativos!.length}):</strong>{" "}
          {negativos!.map((p) => `${p.nome.trim()} (${Number(p.quantidade)} ${p.unidade})`).join(", ")}.
          <div className="mt-1 text-xs">
            Aconteceu porque uma venda feita sem internet chegou depois de o produto acabar. Confira a contagem real e ajuste em{" "}
            <Link href="/estoque/movimentos" className="font-medium underline">Movimentar estoque</Link>.
          </div>
        </div>
      )}

      {baixos.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Estoque baixo:</strong> {baixos.map((p) => p.nome).join(", ")}
        </div>
      )}

      {grupos.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span>
            <strong>{grupos.reduce((n, g) => n + g.length, 0)} produtos repetidos</strong> em {grupos.length}{" "}
            {grupos.length === 1 ? "grupo" : "grupos"} (mesmo nome).
          </span>
          <Link href="/estoque/repetidos" className="rounded-lg bg-amber-600 px-3 py-1 font-medium text-white">Revisar e excluir</Link>
        </div>
      )}

      <form className="mb-4">
        <input name="q" defaultValue={q} placeholder="Buscar por nome, SKU ou código de barras"
          className="w-full rounded-lg border border-gray-300 px-3 py-2" />
      </form>

      <TabelaEstoque produtos={produtos} />
    </main>
  );
}
