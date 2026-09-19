import Link from "next/link";
import { exigirPagina } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { brl } from "@/lib/format";
import type { Produto } from "@/types/produto";
import ExcluirProdutoButton from "@/components/estoque/ExcluirProdutoButton";

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
  if (q) query = query.or(`nome.ilike.%${q}%,sku.ilike.%${q}%`);
  const { data } = await query;
  const produtos = (data ?? []) as Produto[];
  const baixos = produtos.filter((p) => p.quantidade <= p.estoque_minimo);

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">Estoque</h1>
        <div className="flex gap-2">
          <Link href="/estoque/movimentos" className="rounded-lg border border-brand px-4 py-2 font-medium text-brand">
            Movimentar estoque
          </Link>
          <Link href="/estoque/novo" className="rounded-lg bg-brand px-4 py-2 text-white font-medium">
            + Novo produto
          </Link>
        </div>
      </div>

      {baixos.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Estoque baixo:</strong> {baixos.map((p) => p.nome).join(", ")}
        </div>
      )}

      <form className="mb-4">
        <input name="q" defaultValue={q} placeholder="Buscar por nome ou SKU"
          className="w-full rounded-lg border border-gray-300 px-3 py-2" />
      </form>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
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
              <tr key={p.id} className="border-t border-gray-100">
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
                <td className="p-3">{p.sku}</td>
                <td className="p-3 text-right">{brl(p.preco_custo)}</td>
                <td className="p-3 text-right">{brl(p.preco_venda)}</td>
                <td className={`p-3 text-right ${p.quantidade <= p.estoque_minimo ? "text-red-600 font-semibold" : ""}`}>
                  {p.quantidade} {p.unidade}
                </td>
                <td className="p-3 text-right space-x-3 whitespace-nowrap">
                  <Link href={`/estoque/${p.id}`} className="text-brand hover:underline">Editar</Link>
                  <ExcluirProdutoButton id={p.id} nome={p.nome} />
                </td>
              </tr>
            ))}
            {produtos.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-gray-500">Nenhum produto cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
