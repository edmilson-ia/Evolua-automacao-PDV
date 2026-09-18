import { NextResponse } from "next/server";
import { exigirApi } from "@/lib/auth";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";

const movimentoSchema = z.object({
  produto_id: z.string().uuid(),
  // "ajuste" = inventário: a quantidade informada é a CONTAGEM REAL; o sistema calcula a diferença.
  tipo: z.enum(["entrada", "saida", "ajuste"]),
  quantidade: z.coerce.number().min(0),
  motivo: z.string().trim().max(200).nullish(),
  preco_custo: z.coerce.number().min(0).nullish(),
});

export async function GET(req: Request) {
  const negado = await exigirApi(["admin"]);
  if (negado) return negado;
  const sp = new URL(req.url).searchParams;
  const limite = Math.min(Number(sp.get("limit")) || 200, 500);
  let query = createServerClient()
    .from("movimentos_estoque")
    .select("id, tipo, quantidade, motivo, criado_em, venda_id, produtos(nome, sku, unidade)")
    .eq("tenant_id", getTenantId())
    .order("criado_em", { ascending: false })
    .limit(limite);
  const produto = sp.get("produto_id");
  const tipo = sp.get("tipo");
  if (produto) query = query.eq("produto_id", produto);
  if (tipo) query = query.eq("tipo", tipo);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const negado = await exigirApi(["admin"]);
  if (negado) return negado;
  const parsed = movimentoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const m = parsed.data;
  const db = createServerClient();

  const { data: produto } = await db
    .from("produtos")
    .select("id, nome, quantidade, unidade")
    .eq("id", m.produto_id)
    .eq("tenant_id", getTenantId())
    .eq("ativo", true)
    .single();
  if (!produto) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

  const atual = Number(produto.quantidade);
  let tipoReal: "entrada" | "saida";
  let qtdMov: number;
  let motivo = m.motivo?.trim() || null;

  if (m.tipo === "ajuste") {
    const delta = m.quantidade - atual;
    if (delta === 0) {
      return NextResponse.json({ error: "A contagem é igual ao estoque atual: nada a ajustar" }, { status: 400 });
    }
    tipoReal = delta > 0 ? "entrada" : "saida";
    qtdMov = Math.abs(delta);
    motivo = `Ajuste de inventário (contagem ${m.quantidade}, sistema ${atual})${motivo ? ` — ${motivo}` : ""}`;
  } else {
    if (!(m.quantidade > 0)) {
      return NextResponse.json({ error: "Informe uma quantidade maior que zero" }, { status: 400 });
    }
    if (m.tipo === "saida" && m.quantidade > atual) {
      return NextResponse.json(
        { error: `Saída maior que o estoque: há apenas ${atual} ${produto.unidade} de ${produto.nome.trim()}` },
        { status: 422 },
      );
    }
    tipoReal = m.tipo;
    qtdMov = m.quantidade;
  }

  const { error } = await db.rpc("registrar_movimento", {
    p_tenant_id: getTenantId(),
    p_produto_id: m.produto_id,
    p_tipo: tipoReal,
    p_quantidade: qtdMov,
    p_motivo: motivo,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Entrada com custo informado atualiza o preço de custo do produto
  if (tipoReal === "entrada" && m.tipo === "entrada" && m.preco_custo != null) {
    await db.from("produtos").update({ preco_custo: m.preco_custo }).eq("id", m.produto_id).eq("tenant_id", getTenantId());
  }

  const nova = tipoReal === "entrada" ? atual + qtdMov : atual - qtdMov;
  return NextResponse.json({ ok: true, quantidade_anterior: atual, quantidade_nova: nova }, { status: 201 });
}
