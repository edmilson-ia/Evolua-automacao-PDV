import { NextResponse } from "next/server";
import { exigirApi } from "@/lib/auth";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import { dayRangeSP } from "@/lib/format";

const vendaSchema = z.object({
  itens: z
    .array(z.object({ produto_id: z.string().uuid(), quantidade: z.coerce.number().positive() }))
    .min(1, "Carrinho vazio"),
  forma_pagamento: z.enum(["dinheiro", "debito", "credito", "pix"]),
  desconto: z.coerce.number().min(0).default(0),
  valor_recebido: z.coerce.number().min(0).nullable().optional(),
});

const SELECT_VENDA = "*, itens_venda(id, quantidade, preco_unitario, subtotal, produtos(nome, unidade))";

export async function GET(req: Request) {
  const negado = await exigirApi();
  if (negado) return negado;
  const data = new URL(req.url).searchParams.get("data");
  const { inicio, fim } = dayRangeSP(data);
  const { data: vendas, error } = await createServerClient()
    .from("vendas")
    .select(SELECT_VENDA)
    .eq("tenant_id", getTenantId())
    .gte("criado_em", inicio)
    .lt("criado_em", fim)
    .order("criado_em", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(vendas);
}

export async function POST(req: Request) {
  const negado = await exigirApi();
  if (negado) return negado;
  const parsed = vendaSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const v = parsed.data;
  const db = createServerClient();

  const { data: vendaId, error } = await db.rpc("fechar_venda", {
    p_tenant_id: getTenantId(),
    p_itens: v.itens,
    p_forma_pagamento: v.forma_pagamento,
    p_desconto: v.desconto,
    p_valor_recebido: v.valor_recebido ?? null,
  });
  if (error) {
    // Erros de regra (estoque insuficiente etc.) vêm de raise exception (P0001)
    const status = error.code === "P0001" ? 422 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  const { data: venda } = await db.from("vendas").select(SELECT_VENDA).eq("id", vendaId).single();
  return NextResponse.json(venda, { status: 201 });
}
