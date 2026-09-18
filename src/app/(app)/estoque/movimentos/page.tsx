import Link from "next/link";
import { exigirPagina } from "@/lib/auth";
import FormMovimento, { type ProdutoMov } from "@/components/estoque/FormMovimento";
import { dataHoraBR } from "@/lib/format";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

type Mov = {
  id: string;
  tipo: "entrada" | "saida" | "venda" | "ajuste";
  quantidade: number;
  motivo: string | null;
  criado_em: string;
  operador_nome: string | null;
  produtos: { nome: string; sku: string; unidade: string } | null;
};

const BADGE: Record<Mov["tipo"], { txt: string; cls: string; sinal: string }> = {
  entrada: { txt: "Entrada", cls: "bg-emerald-100 text-emerald-800", sinal: "+" },
  saida: { txt: "Saída", cls: "bg-red-100 text-red-800", sinal: "−" },
  venda: { txt: "Venda", cls: "bg-sky-100 text-sky-800", sinal: "−" },
  ajuste: { txt: "Ajuste", cls: "bg-amber-100 text-amber-800", sinal: "+" },
};

export default async function MovimentosPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  await exigirPagina(["admin"]);
  const { tipo } = await searchParams;
  const db = createServerClient();

  const [{ data: produtos }, { data: movs }] = await Promise.all([
    db
      .from("produtos")
      .select("id, nome, sku, quantidade, unidade, preco_custo")
      .eq("tenant_id", getTenantId())
      .eq("ativo", true)
      .order("nome"),
    (() => {
      let q = db
        .from("movimentos_estoque")
        .select("id, tipo, quantidade, motivo, criado_em, operador_nome, produtos(nome, sku, unidade)")
        .eq("tenant_id", getTenantId())
        .order("criado_em", { ascending: false })
        .limit(150);
      if (tipo && tipo in BADGE) q = q.eq("tipo", tipo);
      return q;
    })(),
  ]);

  const lista = (movs ?? []) as unknown as Mov[];
  const filtros = [{ id: "", txt: "Todos" }, ...(["entrada", "saida", "venda"] as const).map((t) => ({ id: t, txt: BADGE[t].txt }))];

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Movimentos de estoque</h1>
        <Link href="/estoque" className="text-sm font-medium text-brand hover:underline">← Voltar ao estoque</Link>
      </div>

      <FormMovimento
        produtos={((produtos ?? []) as unknown as ProdutoMov[]).map((p) => ({
          ...p,
          quantidade: Number(p.quantidade),
          preco_custo: Number(p.preco_custo),
        }))}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-600">Histórico:</span>
        {filtros.map((f) => (
          <Link
            key={f.id}
            href={f.id ? `?tipo=${f.id}` : "?"}
            className={`rounded-full border px-3 py-1 text-sm ${
              (tipo ?? "") === f.id ? "border-transparent bg-brand text-white" : "border-gray-300 bg-white"
            }`}
          >
            {f.txt}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-3">Data</th>
              <th className="p-3">Produto</th>
              <th className="p-3">Tipo</th>
              <th className="p-3 text-right">Qtd</th>
              <th className="p-3">Motivo</th>
              <th className="p-3">Por</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((m) => {
              const b = BADGE[m.tipo];
              return (
                <tr key={m.id} className="border-t border-gray-100">
                  <td className="whitespace-nowrap p-3 text-gray-600">{dataHoraBR(m.criado_em)}</td>
                  <td className="p-3 font-medium">{m.produtos?.nome.trim() ?? "—"}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${b.cls}`}>{b.txt}</span>
                  </td>
                  <td className="whitespace-nowrap p-3 text-right font-semibold">
                    {b.sinal}
                    {Number(m.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {m.produtos?.unidade}
                  </td>
                  <td className="p-3 text-gray-600">{m.motivo ?? ""}</td>
                  <td className="whitespace-nowrap p-3 text-gray-600">{m.operador_nome ?? "—"}</td>
                </tr>
              );
            })}
            {lista.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-gray-500">Nenhum movimento registrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
