import Link from "next/link";
import { notFound } from "next/navigation";
import AcoesCaixa from "@/components/caixa/AcoesCaixa";
import BotaoImprimir from "@/components/caixa/BotaoImprimir";
import { exigirPagina } from "@/lib/auth";
import { getCaixa, getResumoCaixa } from "@/lib/caixa";
import { brl, dataHoraBR } from "@/lib/format";
import { createServerClient } from "@/lib/supabase/server";
import { getBranding, getConfigPagamento } from "@/lib/tenant";
import { FORMA_LABEL } from "@/types/venda";
import { FORMAS_CAIXA, type Conferencia, type MovimentoCaixa } from "@/types/caixa";

export const dynamic = "force-dynamic";

const corDiferenca = (d: number) => (d === 0 ? "text-emerald-700" : d < 0 ? "text-red-600" : "text-amber-600");
const sinal = (d: number) => (d === 0 ? "Bateu" : `${d > 0 ? "+" : ""}${brl(d)}`);

export default async function RelatorioCaixaPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirPagina(); // admin e operador
  const admin = sessao.perfil === "admin";
  const { id } = await params;
  const caixa = await getCaixa(sessao.tenantId, id);
  // Operador só vê o próprio caixa; de outro operador = "não encontrado"
  if (!caixa || (!admin && caixa.operador_id !== sessao.id)) notFound();

  const aberto = caixa.status === "aberto";
  // Fechamento cego: enquanto o caixa está aberto, o operador não vê totais nem o esperado
  const mostrarTotais = !aberto || admin;
  const [{ data: movs }, resumoVivo, branding, config, meuCaixa] = await Promise.all([
    createServerClient().from("movimentos_caixa").select("id, tipo, valor, motivo, operador_nome, criado_em").eq("tenant_id", sessao.tenantId).eq("caixa_id", id).order("criado_em"),
    aberto && admin ? getResumoCaixa(sessao.tenantId, id) : Promise.resolve(null),
    getBranding(sessao.tenantId),
    getConfigPagamento(sessao.tenantId),
    Promise.resolve(aberto && caixa.operador_id === sessao.id ? { id: caixa.id, terminal: caixa.terminal, aberto_em: caixa.aberto_em, valor_inicial: Number(caixa.valor_inicial) } : null),
  ]);
  const movimentos = (movs ?? []) as MovimentoCaixa[];
  // Caixa fechado: usa a cópia guardada (o relatório não muda depois). Aberto: resumo em tempo real.
  const conf: Conferencia | null = caixa.conferencia;
  const resumo = conf?.resumo ?? resumoVivo;

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/caixa" className="text-sm font-medium text-brand hover:underline">← Voltar aos caixas</Link>
        <div className="flex flex-wrap gap-2">
          {meuCaixa && <AcoesCaixa caixa={meuCaixa} obrigatorio={config.caixa_obrigatorio} />}
          <BotaoImprimir />
        </div>
      </div>

      <article className="rounded-xl border border-gray-200 bg-white p-5 print:border-0 print:p-0">
        <header className="mb-4 border-b border-gray-200 pb-3">
          <div className="text-sm text-gray-500">{branding.nome_fantasia}</div>
          <h1 className="text-2xl font-bold">
            Relatório de caixa — {caixa.terminal}{" "}
            <span className={`ml-2 rounded-full px-2 py-0.5 align-middle text-xs font-semibold ${aberto ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-700"}`}>
              {aberto ? "ABERTO" : "FECHADO"}
            </span>
          </h1>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div><dt className="inline text-gray-500">Operador: </dt><dd className="inline font-medium">{caixa.operador_nome}</dd></div>
            <div><dt className="inline text-gray-500">Valor inicial: </dt><dd className="inline font-medium">{brl(Number(caixa.valor_inicial))}</dd></div>
            <div><dt className="inline text-gray-500">Aberto em: </dt><dd className="inline font-medium">{dataHoraBR(caixa.aberto_em)}</dd></div>
            <div>
              <dt className="inline text-gray-500">Fechado em: </dt>
              <dd className="inline font-medium">
                {caixa.fechado_em ? `${dataHoraBR(caixa.fechado_em)}${caixa.fechado_por_nome ? ` (por ${caixa.fechado_por_nome})` : ""}` : "—"}
              </dd>
            </div>
          </dl>
        </header>

        {!mostrarTotais && (
          <p className="mb-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
            Caixa aberto. Os totais e a conferência aparecem depois do fechamento.
          </p>
        )}

        {mostrarTotais && resumo && (
          <section className="mb-5">
            <h2 className="mb-2 font-semibold">Vendas do turno</h2>
            <table className="w-full text-sm">
              <tbody>
                {FORMAS_CAIXA.map((f) => (
                  <tr key={f} className="border-b border-gray-100">
                    <td className="py-1.5">{FORMA_LABEL[f]}</td>
                    <td className="py-1.5 text-right">{brl(Number(resumo.vendas[f]))}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="py-1.5">Total ({resumo.vendas.qtd} venda(s))</td>
                  <td className="py-1.5 text-right">{brl(Number(resumo.vendas.total))}</td>
                </tr>
              </tbody>
            </table>
            {resumo.canceladas.qtd > 0 && (
              <p className="mt-2 text-sm text-red-600">
                {resumo.canceladas.qtd} venda(s) cancelada(s): {brl(Number(resumo.canceladas.total))} (fora dos totais)
              </p>
            )}
          </section>
        )}

        <section className="mb-5">
          <h2 className="mb-2 font-semibold">Sangrias e suprimentos</h2>
          {movimentos.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum movimento neste caixa.</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {movimentos.map((m) => (
                <li key={m.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                  <span>
                    <strong className={m.tipo === "sangria" ? "text-red-600" : "text-emerald-700"}>{m.tipo === "sangria" ? "Sangria" : "Suprimento"}</strong>{" "}
                    · {m.motivo} <span className="text-gray-500">({m.operador_nome}, {dataHoraBR(m.criado_em)})</span>
                  </span>
                  <span className="font-medium">{m.tipo === "sangria" ? "−" : "+"}{brl(Number(m.valor))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {mostrarTotais && resumo && (
          <section className="mb-5">
            <h2 className="mb-2 font-semibold">{conf ? "Conferência (esperado × contado)" : "Esperado até agora"}</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500">
                <tr>
                  <th className="pb-1">Forma</th>
                  <th className="pb-1 text-right">Esperado</th>
                  {conf && <th className="pb-1 text-right">Contado</th>}
                  {conf && <th className="pb-1 text-right">Diferença</th>}
                </tr>
              </thead>
              <tbody>
                {FORMAS_CAIXA.map((f) => {
                  const c = conf?.formas[f];
                  const esperado = f === "dinheiro" ? resumo.esperado_dinheiro : resumo.vendas[f];
                  return (
                    <tr key={f} className="border-t border-gray-100">
                      <td className="py-1.5">{FORMA_LABEL[f]}</td>
                      <td className="py-1.5 text-right">{brl(Number(esperado))}</td>
                      {conf && <td className="py-1.5 text-right">{c?.contado == null ? <span className="text-gray-400">não conferido</span> : brl(Number(c.contado))}</td>}
                      {conf && (
                        <td className={`py-1.5 text-right font-semibold ${c?.diferenca == null ? "" : corDiferenca(Number(c.diferenca))}`}>
                          {c?.diferenca == null ? "—" : sinal(Number(c.diferenca))}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-gray-500">
              Dinheiro esperado = valor inicial {brl(Number(resumo.valor_inicial))} + vendas em dinheiro {brl(Number(resumo.vendas.dinheiro))} + suprimentos{" "}
              {brl(Number(resumo.suprimentos))} − sangrias {brl(Number(resumo.sangrias))}.
            </p>
          </section>
        )}

        {caixa.observacao && (
          <p className="mb-5 text-sm"><strong>Observação:</strong> {caixa.observacao}</p>
        )}

        <footer className="mt-8 hidden grid-cols-2 gap-10 pt-8 text-center text-xs text-gray-500 print:grid">
          <div className="border-t border-gray-400 pt-1">Operador</div>
          <div className="border-t border-gray-400 pt-1">Responsável</div>
        </footer>
      </article>
    </main>
  );
}
