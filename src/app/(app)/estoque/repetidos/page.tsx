import Link from "next/link";
import { exigirPagina } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { brl, dataHoraBR } from "@/lib/format";
import { gruposRepetidos } from "@/lib/repetidos";
import ExcluirProdutoButton from "@/components/estoque/ExcluirProdutoButton";

export const dynamic = "force-dynamic";

export default async function RepetidosPage() {
  const sessao = await exigirPagina(["admin"]);
  const grupos = await gruposRepetidos(createServerClient(), sessao.tenantId, true);

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <Link href="/estoque" className="text-sm text-brand hover:underline">‹ Voltar ao estoque</Link>
      <h1 className="mt-2 mb-1 text-2xl font-bold">Produtos repetidos</h1>
      <p className="mb-5 text-sm text-gray-600">
        Produtos com o mesmo nome (sem contar maiúsculas, acentos e pontuação). Escolha qual manter e exclua os outros:
        a exclusão só tira o produto das listas, o histórico de vendas fica guardado.
      </p>

      {grupos.length === 0 ? (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          Nenhum produto repetido. Sua lista está limpa.
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.map((grupo) => (
            <section key={grupo[0].id} className="overflow-x-auto rounded-lg border border-gray-200">
              <h2 className="bg-gray-50 p-3 font-semibold">
                {grupo[0].nome.trim()} <span className="font-normal text-gray-500">({grupo.length} iguais)</span>
              </h2>
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500">
                  <tr>
                    <th className="p-3">SKU</th>
                    <th className="p-3 text-right">Custo</th>
                    <th className="p-3 text-right">Venda</th>
                    <th className="p-3 text-right">Estoque</th>
                    <th className="p-3">Cadastro</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {grupo.map((p) => (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="p-3">{p.sku}</td>
                      <td className="p-3 text-right">{brl(p.preco_custo)}</td>
                      <td className="p-3 text-right">{brl(p.preco_venda)}</td>
                      <td className="p-3 text-right">{p.quantidade} {p.unidade}</td>
                      <td className="p-3">
                        {dataHoraBR(p.criado_em)}
                        {p.vendas > 0 && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">tem vendas</span>}
                      </td>
                      <td className="space-x-3 whitespace-nowrap p-3 text-right">
                        <Link href={`/estoque/${p.id}`} className="text-brand hover:underline">Editar</Link>
                        <ExcluirProdutoButton id={p.id} nome={p.nome} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
