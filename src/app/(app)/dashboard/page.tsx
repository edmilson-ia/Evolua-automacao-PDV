import Link from "next/link";
import { exigirPagina } from "@/lib/auth";
import { brl, hojeSP } from "@/lib/format";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import { calcularLiquido } from "@/lib/taxas";
import { FORMA_LABEL, type FormaPagamento } from "@/types/venda";

export const dynamic = "force-dynamic";

const PERIODOS = { hoje: { n: 1, txt: "Hoje" }, "7d": { n: 7, txt: "7 dias" }, "30d": { n: 30, txt: "30 dias" } } as const;
type Periodo = keyof typeof PERIODOS;

const CORES_FORMA: Record<FormaPagamento, string> = {
  dinheiro: "bg-emerald-500",
  debito: "bg-sky-500",
  credito: "bg-violet-500",
  pix: "bg-teal-500",
  cartao: "bg-gray-400",
};

/** Data (YYYY-MM-DD) em São Paulo, `atras` dias antes de hoje. */
function diaSP(atras: number): string {
  const base = new Date(`${hojeSP()}T12:00:00-03:00`);
  base.setDate(base.getDate() - atras);
  return base.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
const dataSP = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const horaSP = (iso: string) =>
  Number(new Date(iso).toLocaleString("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }));

type VendaRow = { total: number; forma_pagamento: FormaPagamento; criado_em: string; operador_id: string | null; operador_nome: string | null };
type ItemRow = { quantidade: number; subtotal: number; produtos: { nome: string; unidade: string } | null };
type ProdutoRow = { nome: string; quantidade: number; estoque_minimo: number; preco_custo: number; preco_venda: number; unidade: string };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  await exigirPagina(["admin"]);
  const sp = await searchParams;
  const periodo: Periodo = sp.periodo && sp.periodo in PERIODOS ? (sp.periodo as Periodo) : "hoje";
  const n = PERIODOS[periodo].n;

  const inicio = new Date(`${diaSP(n - 1)}T00:00:00-03:00`).toISOString();
  const fim = new Date(new Date(`${hojeSP()}T00:00:00-03:00`).getTime() + 86400000).toISOString();

  const db = createServerClient();
  const tenant = getTenantId();
  const [vendasRes, itensRes, produtosRes] = await Promise.all([
    db.from("vendas").select("total, forma_pagamento, criado_em, operador_id, operador_nome").eq("tenant_id", tenant).eq("status", "concluida").gte("criado_em", inicio).lt("criado_em", fim),
    db
      .from("itens_venda")
      .select("quantidade, subtotal, produtos(nome, unidade), vendas!inner(criado_em, status, tenant_id)")
      .eq("vendas.tenant_id", tenant)
      .eq("vendas.status", "concluida")
      .gte("vendas.criado_em", inicio)
      .lt("vendas.criado_em", fim),
    db.from("produtos").select("nome, quantidade, estoque_minimo, preco_custo, preco_venda, unidade").eq("tenant_id", tenant).eq("ativo", true),
  ]);

  const vendas = (vendasRes.data ?? []) as unknown as VendaRow[];
  const itens = (itensRes.data ?? []) as unknown as ItemRow[];
  const produtos = (produtosRes.data ?? []) as unknown as ProdutoRow[];

  // ---- KPIs ----
  const bruto = vendas.reduce((s, v) => s + Number(v.total), 0);
  const liquido = vendas.reduce((s, v) => s + calcularLiquido(v.forma_pagamento, Number(v.total)).liquido, 0);
  const ticket = vendas.length ? bruto / vendas.length : 0;

  // ---- vendas por operador (agrupa pelo id; o nome é o da hora da venda) ----
  const porOperador = new Map<string, { nome: string; qtd: number; bruto: number; liquido: number }>();
  vendas.forEach((v) => {
    const chave = v.operador_id ?? "sem-operador";
    const atual = porOperador.get(chave) ?? { nome: v.operador_nome ?? "Sem operador registrado", qtd: 0, bruto: 0, liquido: 0 };
    atual.qtd += 1;
    atual.bruto += Number(v.total);
    atual.liquido += calcularLiquido(v.forma_pagamento, Number(v.total)).liquido;
    porOperador.set(chave, atual);
  });
  const operadores = [...porOperador.entries()].sort(([, a], [, b]) => b.bruto - a.bruto);

  // ---- gráfico: por hora (hoje) ou por dia ----
  const baldes: { rotulo: string; valor: number }[] = [];
  if (periodo === "hoje") {
    const porHora = new Array(24).fill(0) as number[];
    vendas.forEach((v) => (porHora[horaSP(v.criado_em)] += Number(v.total)));
    for (let h = 6; h <= 23; h++) baldes.push({ rotulo: `${h}h`, valor: porHora[h] });
  } else {
    const porDia = new Map<string, number>();
    for (let i = n - 1; i >= 0; i--) porDia.set(diaSP(i), 0);
    vendas.forEach((v) => porDia.set(dataSP(v.criado_em), (porDia.get(dataSP(v.criado_em)) ?? 0) + Number(v.total)));
    porDia.forEach((valor, dia) => baldes.push({ rotulo: dia.slice(8) + "/" + dia.slice(5, 7), valor }));
  }
  const maxBalde = Math.max(...baldes.map((b) => b.valor), 1);

  // ---- por forma de pagamento ----
  const porForma = new Map<FormaPagamento, number>();
  vendas.forEach((v) => porForma.set(v.forma_pagamento, (porForma.get(v.forma_pagamento) ?? 0) + Number(v.total)));
  const formas = [...porForma.entries()].sort((a, b) => b[1] - a[1]);

  // ---- mais vendidos ----
  const porProduto = new Map<string, { qtd: number; valor: number; un: string }>();
  itens.forEach((i) => {
    const nome = i.produtos?.nome.trim() ?? "—";
    const a = porProduto.get(nome) ?? { qtd: 0, valor: 0, un: i.produtos?.unidade ?? "un" };
    porProduto.set(nome, { ...a, qtd: a.qtd + Number(i.quantidade), valor: a.valor + Number(i.subtotal) });
  });
  const top = [...porProduto.entries()].sort((a, b) => b[1].valor - a[1].valor).slice(0, 5);
  const maxTop = Math.max(...top.map(([, x]) => x.valor), 1);

  // ---- estoque ----
  const alerta = produtos.filter((p) => Number(p.quantidade) <= Number(p.estoque_minimo)).sort((a, b) => Number(a.quantidade) - Number(b.quantidade));
  const valorCusto = produtos.reduce((s, p) => s + Number(p.quantidade) * Number(p.preco_custo), 0);
  const valorVenda = produtos.reduce((s, p) => s + Number(p.quantidade) * Number(p.preco_venda), 0);

  // ---- margem de lucro (preço de venda − preço de custo, dos produtos do estoque) ----
  const margens = produtos
    .map((p) => {
      const custo = Number(p.preco_custo);
      const venda = Number(p.preco_venda);
      return { nome: p.nome.trim(), custo, venda, lucro: venda - custo, pct: venda > 0 ? ((venda - custo) / venda) * 100 : 0, qtd: Number(p.quantidade) };
    })
    .sort((a, b) => a.pct - b.pct);
  const margemMedia = margens.length ? margens.reduce((s, m) => s + m.pct, 0) / margens.length : 0;
  const lucroUnitMedio = margens.length ? margens.reduce((s, m) => s + m.lucro, 0) / margens.length : 0;
  const lucroPotencial = valorVenda - valorCusto; // lucro se todo o estoque atual for vendido
  const abaixoDoCusto = margens.filter((m) => m.lucro < 0);
  const corMargem = (pct: number) => (pct < 0 ? "text-red-600" : pct < 20 ? "text-amber-600" : "text-emerald-700");

  const card = "rounded-xl border border-gray-200 bg-white p-4";

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex gap-2">
          {(Object.keys(PERIODOS) as Periodo[]).map((p) => (
            <Link
              key={p}
              href={`?periodo=${p}`}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                p === periodo ? "border-transparent bg-brand text-white" : "border-gray-300 bg-white"
              }`}
            >
              {PERIODOS[p].txt}
            </Link>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={card}>
          <div className="text-xs text-gray-500">Faturamento (bruto)</div>
          <div className="text-2xl font-bold">{brl(bruto)}</div>
        </div>
        <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 p-4">
          <div className="text-xs text-emerald-800">Líquido (após taxas de cartão)</div>
          <div className="text-2xl font-bold text-emerald-900">{brl(liquido)}</div>
          <div className="text-xs text-emerald-800">Taxas: −{brl(bruto - liquido)}</div>
        </div>
        <div className={card}>
          <div className="text-xs text-gray-500">Vendas</div>
          <div className="text-2xl font-bold">{vendas.length}</div>
        </div>
        <div className={card}>
          <div className="text-xs text-gray-500">Ticket médio</div>
          <div className="text-2xl font-bold">{brl(ticket)}</div>
        </div>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        {/* Gráfico */}
        <section className={`${card} lg:col-span-2`}>
          <h2 className="mb-3 font-semibold">{periodo === "hoje" ? "Vendas por hora" : "Vendas por dia"}</h2>
          <div className="flex h-48 items-end gap-1">
            {baldes.map((b) => (
              <div key={b.rotulo} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${b.rotulo}: ${brl(b.valor)}`}>
                <div
                  className={`w-full rounded-t ${b.valor > 0 ? "bg-brand" : "bg-gray-100"}`}
                  style={{ height: `${Math.max((b.valor / maxBalde) * 100, b.valor > 0 ? 4 : 1.5)}%` }}
                />
                <span className="text-[10px] text-gray-500">{n > 14 ? (Number(b.rotulo.slice(0, 2)) % 5 === 0 ? b.rotulo : "") : b.rotulo}</span>
              </div>
            ))}
          </div>
          {bruto === 0 && <p className="mt-2 text-center text-sm text-gray-500">Nenhuma venda neste período.</p>}
        </section>

        {/* Formas de pagamento */}
        <section className={card}>
          <h2 className="mb-3 font-semibold">Formas de pagamento</h2>
          <ul className="space-y-3">
            {formas.map(([f, v]) => (
              <li key={f}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{FORMA_LABEL[f]}</span>
                  <span className="font-medium">{brl(v)} · {bruto ? Math.round((v / bruto) * 100) : 0}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div className={`h-2 rounded-full ${CORES_FORMA[f]}`} style={{ width: `${bruto ? (v / bruto) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
            {formas.length === 0 && <li className="text-sm text-gray-500">Sem vendas.</li>}
          </ul>
        </section>
      </div>

      {/* Vendas por operador */}
      <section className={`${card} mb-4`}>
        <h2 className="mb-3 font-semibold">Vendas por operador</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr>
              <th className="pb-2">Operador</th>
              <th className="pb-2 text-right">Vendas</th>
              <th className="pb-2 text-right">Bruto</th>
              <th className="pb-2 text-right">Líquido</th>
            </tr>
          </thead>
          <tbody>
            {operadores.map(([id, o]) => (
              <tr key={id} className="border-t border-gray-100">
                <td className="py-1.5 font-medium">{o.nome}</td>
                <td className="py-1.5 text-right">{o.qtd}</td>
                <td className="py-1.5 text-right">{brl(o.bruto)}</td>
                <td className="py-1.5 text-right font-semibold text-emerald-700">{brl(o.liquido)}</td>
              </tr>
            ))}
            {operadores.length === 0 && (
              <tr><td colSpan={4} className="py-3 text-center text-gray-500">Sem vendas neste período.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Margem de lucro */}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <section
          className={`rounded-xl border-2 p-4 ${margemMedia < 0 ? "border-red-500 bg-red-50" : "border-violet-500 bg-violet-50"}`}
        >
          <div className={`text-xs font-medium ${margemMedia < 0 ? "text-red-800" : "text-violet-800"}`}>Margem de lucro (estoque)</div>
          <div className={`text-4xl font-bold ${margemMedia < 0 ? "text-red-700" : "text-violet-900"}`}>
            {margemMedia.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
          </div>
          <div className="mb-3 text-xs text-gray-600">média dos {margens.length} produto(s): (venda − custo) ÷ venda</div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600">Lucro médio por unidade</dt>
              <dd className={`font-semibold ${corMargem(lucroUnitMedio)}`}>{brl(lucroUnitMedio)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Lucro do estoque atual</dt>
              <dd className={`font-semibold ${corMargem(lucroPotencial)}`}>{brl(lucroPotencial)}</dd>
            </div>
          </dl>
          {abaixoDoCusto.length > 0 && (
            <p className="mt-3 rounded-lg bg-red-100 p-2 text-xs font-medium text-red-800">
              ⚠ {abaixoDoCusto.length} produto(s) vendendo abaixo do custo: {abaixoDoCusto.map((m) => m.nome).join(", ")}
            </p>
          )}
        </section>

        <section className={`${card} lg:col-span-2`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Margem por produto</h2>
            <Link href="/estoque" className="text-sm font-medium text-brand hover:underline">Ajustar preços →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500">
                <tr>
                  <th className="pb-2">Produto</th>
                  <th className="pb-2 text-right">Custo</th>
                  <th className="pb-2 text-right">Venda</th>
                  <th className="pb-2 text-right">Lucro/un</th>
                  <th className="pb-2 text-right">Margem</th>
                </tr>
              </thead>
              <tbody>
                {margens.slice(0, 8).map((m) => (
                  <tr key={m.nome} className="border-t border-gray-100">
                    <td className="py-1.5 pr-2">{m.nome}</td>
                    <td className="py-1.5 text-right">{brl(m.custo)}</td>
                    <td className="py-1.5 text-right">{brl(m.venda)}</td>
                    <td className={`py-1.5 text-right font-medium ${corMargem(m.pct)}`}>{brl(m.lucro)}</td>
                    <td className={`py-1.5 text-right font-semibold ${corMargem(m.pct)}`}>
                      {m.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                    </td>
                  </tr>
                ))}
                {margens.length === 0 && (
                  <tr><td colSpan={5} className="py-3 text-center text-gray-500">Nenhum produto cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {margens.length > 8 && <p className="mt-2 text-xs text-gray-500">Mostrando as 8 menores margens de {margens.length} produtos.</p>}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Mais vendidos */}
        <section className={card}>
          <h2 className="mb-3 font-semibold">Mais vendidos</h2>
          <ol className="space-y-3">
            {top.map(([nome, x], i) => (
              <li key={nome}>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="truncate"><span className="text-gray-400">{i + 1}.</span> {nome}</span>
                  <span className="whitespace-nowrap font-medium">{brl(x.valor)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                  <div className="h-1.5 rounded-full bg-brand" style={{ width: `${(x.valor / maxTop) * 100}%` }} />
                </div>
                <div className="text-xs text-gray-500">{x.qtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {x.un} vendidos</div>
              </li>
            ))}
            {top.length === 0 && <li className="text-sm text-gray-500">Sem vendas.</li>}
          </ol>
        </section>

        {/* Estoque */}
        <section className={`${card} lg:col-span-2`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Estoque</h2>
            <Link href="/estoque/movimentos" className="text-sm font-medium text-brand hover:underline">Movimentar estoque →</Link>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Valor em estoque (a custo)</div>
              <div className="text-lg font-bold">{brl(valorCusto)}</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Valor em estoque (a preço de venda)</div>
              <div className="text-lg font-bold">{brl(valorVenda)}</div>
            </div>
          </div>
          <h3 className="mb-2 text-sm font-semibold text-amber-800">
            ⚠ Estoque baixo ou zerado ({alerta.length})
          </h3>
          <ul className="divide-y divide-gray-100 text-sm">
            {alerta.map((p) => (
              <li key={p.nome} className="flex items-center justify-between py-1.5">
                <span className="truncate">{p.nome.trim()}</span>
                <span className={`whitespace-nowrap font-semibold ${Number(p.quantidade) <= 0 ? "text-red-600" : "text-amber-700"}`}>
                  {Number(p.quantidade) <= 0 ? "ZERADO" : `${Number(p.quantidade).toLocaleString("pt-BR")} ${p.unidade}`}
                  <span className="ml-2 text-xs font-normal text-gray-500">mín. {Number(p.estoque_minimo).toLocaleString("pt-BR")}</span>
                </span>
              </li>
            ))}
            {alerta.length === 0 && <li className="py-2 text-gray-500">Tudo em dia. ✔</li>}
          </ul>
        </section>
      </div>
    </main>
  );
}
