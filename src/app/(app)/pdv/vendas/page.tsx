import { createServerClient } from "@/lib/supabase/server";
import { exigirPagina } from "@/lib/auth";
import { getTenantId } from "@/lib/tenant";
import { brl, dataHoraBR, dayRangeSP } from "@/lib/format";
import { calcularLiquido, pctBR } from "@/lib/taxas";
import { FORMA_LABEL, FORMAS_PDV, type FormaPagamento, type Venda } from "@/types/venda";
import Recibo from "@/components/pdv/Recibo";
import CancelarVendaButton from "@/components/pdv/CancelarVendaButton";

export const dynamic = "force-dynamic";

type Soma = { bruto: number; liquido: number };

export default async function HistoricoVendasPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const sessao = await exigirPagina();
  const podeCancelar = sessao.perfil === "admin";
  const { data } = await searchParams;
  const { dia, inicio, fim } = dayRangeSP(data);

  let query = createServerClient()
    .from("vendas")
    .select("*, itens_venda(id, quantidade, preco_unitario, subtotal, produtos(nome, unidade))")
    .eq("tenant_id", getTenantId())
    .gte("criado_em", inicio)
    .lt("criado_em", fim)
    .order("criado_em", { ascending: false });
  // Operador (caixa) só enxerga as próprias vendas; o administrador vê todas
  if (sessao.perfil === "operador") query = query.eq("operador_id", sessao.id);
  const { data: vendas } = await query;

  const lista = (vendas ?? []) as unknown as Venda[];
  const concluidas = lista.filter((v) => v.status === "concluida");
  const canceladas = lista.filter((v) => v.status === "cancelada");
  const totalCancelado = canceladas.reduce((s, v) => s + Number(v.total), 0);

  // Débito/crédito: o líquido desconta a taxa da maquininha. Demais formas: líquido = bruto.
  const porForma = concluidas.reduce<Partial<Record<FormaPagamento, Soma>>>((acc, v) => {
    const atual = acc[v.forma_pagamento] ?? { bruto: 0, liquido: 0 };
    const { liquido } = calcularLiquido(v.forma_pagamento, Number(v.total));
    acc[v.forma_pagamento] = { bruto: atual.bruto + Number(v.total), liquido: atual.liquido + liquido };
    return acc;
  }, {});
  const totalBruto = Object.values(porForma).reduce((s, x) => s + x.bruto, 0);
  const totalLiquido = Object.values(porForma).reduce((s, x) => s + x.liquido, 0);
  const totalTaxas = totalBruto - totalLiquido;

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Vendas</h1>
          {!podeCancelar && <p className="text-xs text-gray-500">Mostrando apenas as suas vendas</p>}
        </div>
        <form className="flex items-center gap-2">
          <input type="date" name="data" defaultValue={dia} className="rounded-lg border border-gray-300 px-3 py-2" />
          <button className="rounded-lg bg-brand px-4 py-2 text-white">Filtrar</button>
        </form>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Total vendido (bruto)</div>
          <div className="text-xl font-bold">{brl(totalBruto)}</div>
          <div className="text-xs text-gray-500">{concluidas.length} venda(s)</div>
          {canceladas.length > 0 && (
            <div className="text-xs text-red-600">
              {canceladas.length} cancelada(s): {brl(totalCancelado)} (fora do total)
            </div>
          )}
        </div>
        <div className="rounded-lg border-2 border-emerald-500 bg-emerald-50 p-3">
          <div className="text-xs text-emerald-800">Líquido do dia (após taxas)</div>
          <div className="text-xl font-bold text-emerald-900">{brl(totalLiquido)}</div>
          <div className="text-xs text-emerald-800">Taxas de cartão: −{brl(totalTaxas)}</div>
        </div>
        {/* "cartao" (legado) só aparece se houver vendas antigas no dia */}
        {[...FORMAS_PDV, ...(porForma.cartao ? (["cartao"] as const) : [])].map((f) => {
          const s = porForma[f] ?? { bruto: 0, liquido: 0 };
          const { taxaPct } = calcularLiquido(f, 0);
          return (
            <div key={f} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-xs text-gray-500">
                {FORMA_LABEL[f]}
                {taxaPct > 0 && ` · taxa ${pctBR(taxaPct)}`}
              </div>
              <div className="text-lg font-semibold">{brl(s.liquido)}</div>
              {taxaPct > 0 && <div className="text-xs text-gray-500">bruto {brl(s.bruto)}</div>}
            </div>
          );
        })}
      </div>

      <ul className="space-y-2">
        {lista.map((v) => {
          const total = Number(v.total);
          const { taxaPct, taxa, liquido } = calcularLiquido(v.forma_pagamento, total);
          const cancelada = v.status === "cancelada";
          const temTaxa = taxaPct > 0 && !cancelada;
          return (
            <li key={v.id} className={`rounded-lg border ${cancelada ? "border-red-200 bg-red-50/50" : "border-gray-200 bg-white"}`}>
              <details>
                <summary className="flex cursor-pointer items-center justify-between gap-3 p-3">
                  <span className="text-sm text-gray-600">
                    {dataHoraBR(v.criado_em)}
                    <span className="block text-xs text-gray-500">{v.operador_nome ?? "Operador não registrado"}</span>
                  </span>
                  <span className="text-sm">
                    {FORMA_LABEL[v.forma_pagamento]}
                    {cancelada && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">CANCELADA</span>}
                  </span>
                  <span className="text-right">
                    <span className={`font-semibold ${cancelada ? "text-gray-400 line-through" : ""}`}>{brl(temTaxa ? liquido : total)}</span>
                    {temTaxa && <span className="block text-xs text-gray-500">bruto {brl(total)}</span>}
                  </span>
                </summary>
                <div className="grid gap-4 border-t border-gray-100 p-4 sm:grid-cols-2">
                  <div className="max-w-sm">
                    <Recibo venda={v} />
                  </div>
                  {cancelada && (
                    <div className="h-fit rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
                      <div className="mb-1 font-semibold">Venda cancelada</div>
                      <div>Motivo: {v.motivo_cancelamento ?? "—"}</div>
                      <div className="text-xs text-red-800">
                        {v.cancelada_por ? `Por ${v.cancelada_por}` : ""}
                        {v.cancelada_em ? ` em ${dataHoraBR(v.cancelada_em)}` : ""}
                      </div>
                      <p className="mt-2 text-xs">Os produtos foram devolvidos ao estoque.</p>
                    </div>
                  )}
                  {!cancelada && podeCancelar && (
                    <div className="h-fit">
                      <CancelarVendaButton vendaId={v.id} total={total} />
                    </div>
                  )}
                  {temTaxa && (
                    <div className="h-fit rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                      <div className="mb-1 font-semibold text-amber-900">
                        Taxa do cartão de {FORMA_LABEL[v.forma_pagamento].toLowerCase()}
                      </div>
                      <div className="flex justify-between"><span>Valor da venda</span><span>{brl(total)}</span></div>
                      <div className="flex justify-between text-red-700">
                        <span>Taxa ({pctBR(taxaPct)})</span><span>−{brl(taxa)}</span>
                      </div>
                      <div className="mt-1 flex justify-between border-t border-amber-300 pt-1 font-bold text-emerald-800">
                        <span>Líquido a receber</span><span>{brl(liquido)}</span>
                      </div>
                      <p className="mt-2 text-xs text-amber-800">Uso interno: não aparece no recibo do cliente.</p>
                    </div>
                  )}
                </div>
              </details>
            </li>
          );
        })}
        {lista.length === 0 && <li className="p-6 text-center text-gray-500">Nenhuma venda nesta data.</li>}
      </ul>
    </main>
  );
}
