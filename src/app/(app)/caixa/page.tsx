import Link from "next/link";
import AcoesCaixa from "@/components/caixa/AcoesCaixa";
import { exigirPagina } from "@/lib/auth";
import { getCaixaAberto } from "@/lib/caixa";
import { brl, dataHoraBR, dayRangeSP } from "@/lib/format";
import { createServerClient } from "@/lib/supabase/server";
import { getConfigPagamento } from "@/lib/tenant";
import { COLUNAS_CAIXA, type Caixa } from "@/types/caixa";

export const dynamic = "force-dynamic";

function Situacao({ c }: { c: Caixa }) {
  if (c.status === "aberto") return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">ABERTO</span>;
  return <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">FECHADO</span>;
}

function Diferenca({ c }: { c: Caixa }) {
  if (c.status !== "fechado" || c.diferenca === null) return <span className="text-gray-400">—</span>;
  const d = Number(c.diferenca);
  const cls = d === 0 ? "text-emerald-700" : d < 0 ? "text-red-600" : "text-amber-600";
  return <span className={`font-semibold ${cls}`}>{d === 0 ? "Bateu" : `${d > 0 ? "+" : ""}${brl(d)}`}</span>;
}

export default async function CaixaPage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const sessao = await exigirPagina(); // admin e operador
  const admin = sessao.perfil === "admin";
  const { data } = await searchParams;
  const { dia, inicio, fim } = dayRangeSP(data);
  const db = createServerClient();

  // Operador só enxerga os próprios caixas; o administrador vê todos da loja
  let consultaAbertos = db.from("caixas").select(COLUNAS_CAIXA).eq("tenant_id", sessao.tenantId).eq("status", "aberto").order("aberto_em");
  let consultaHistorico = db
    .from("caixas")
    .select(COLUNAS_CAIXA)
    .eq("tenant_id", sessao.tenantId)
    .gte("aberto_em", inicio)
    .lt("aberto_em", fim)
    .order("aberto_em", { ascending: false });
  if (!admin) {
    consultaAbertos = consultaAbertos.eq("operador_id", sessao.id);
    consultaHistorico = consultaHistorico.eq("operador_id", sessao.id);
  }
  const [abertos, historico, meuCaixa, config] = await Promise.all([
    consultaAbertos,
    consultaHistorico,
    getCaixaAberto(sessao.tenantId, sessao.id),
    getConfigPagamento(sessao.tenantId),
  ]);
  const listaAbertos = (abertos.data ?? []) as Caixa[];
  const lista = (historico.data ?? []) as Caixa[];

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Caixa</h1>
          <p className="text-sm text-gray-600">
            {config.caixa_obrigatorio ? "Esta loja exige o caixa aberto para vender." : "Caixa opcional nesta loja."}
          </p>
        </div>
        <AcoesCaixa caixa={meuCaixa} obrigatorio={config.caixa_obrigatorio} />
      </div>

      {listaAbertos.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold">Caixas abertos agora</h2>
          <ul className="space-y-2">
            {listaAbertos.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3">
                <span>
                  <strong>{c.terminal}</strong> · {c.operador_nome} · aberto em {dataHoraBR(c.aberto_em)} · inicial {brl(Number(c.valor_inicial))}
                </span>
                <Link href={`/caixa/${c.id}`} className="font-medium text-brand hover:underline">
                  Ver
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Histórico do dia</h2>
        <form className="flex items-center gap-2">
          <input type="date" name="data" defaultValue={dia} className="rounded-lg border border-gray-300 px-3 py-2" />
          <button className="rounded-lg bg-brand px-4 py-2 text-white">Filtrar</button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-3">Terminal</th>
              <th className="p-3">Operador</th>
              <th className="p-3">Abertura</th>
              <th className="p-3">Fechamento</th>
              <th className="p-3">Situação</th>
              <th className="p-3">Dinheiro</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="p-3 font-medium">{c.terminal}</td>
                <td className="p-3">{c.operador_nome}</td>
                <td className="whitespace-nowrap p-3 text-gray-600">{dataHoraBR(c.aberto_em)}</td>
                <td className="whitespace-nowrap p-3 text-gray-600">{c.fechado_em ? dataHoraBR(c.fechado_em) : "—"}</td>
                <td className="p-3"><Situacao c={c} /></td>
                <td className="p-3"><Diferenca c={c} /></td>
                <td className="p-3 text-right">
                  <Link href={`/caixa/${c.id}`} className="text-brand hover:underline">Relatório</Link>
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-gray-500">Nenhum caixa aberto nesta data.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
