import { NextResponse } from "next/server";
import { exigirApi } from "@/lib/auth";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { dayRangeSP } from "@/lib/format";

const vendaSchema = z.object({
  itens: z
    .array(z.object({ produto_id: z.string().uuid(), quantidade: z.coerce.number().positive() }))
    .min(1, "Carrinho vazio"),
  forma_pagamento: z.enum(["dinheiro", "debito", "credito", "pix"]),
  desconto: z.coerce.number().min(0).default(0),
  valor_recebido: z.coerce.number().min(0).nullable().optional(),
  // Só o id do cliente: nome e telefone o banco copia do cadastro (o corpo não decide isso)
  cliente_id: z.string().uuid().nullish(),
  entrega: z.boolean().default(false),
  entrega_endereco: z.string().trim().max(200, "Endereço muito longo (máx. 200)").nullish(),
  // Venda sem internet: a chave (uuid gerado no aparelho) faz o reenvio da MESMA venda não duplicar; `offline` registra a
  // venda mesmo sem estoque (fica negativo) e `criado_em` é a hora real (o banco limita a 7 dias atrás)
  chave: z.string().uuid().nullish(),
  offline: z.boolean().default(false),
  criado_em: z.string().datetime({ offset: true }).nullish(),
});

const SELECT_VENDA = "*, itens_venda(id, quantidade, preco_unitario, subtotal, produtos(nome, unidade))";

export async function GET(req: Request) {
  const acesso = await exigirApi();
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;
  const data = new URL(req.url).searchParams.get("data");
  const { inicio, fim } = dayRangeSP(data);
  let query = createServerClient()
    .from("vendas")
    .select(SELECT_VENDA)
    .eq("tenant_id", sessao.tenantId)
    .gte("criado_em", inicio)
    .lt("criado_em", fim)
    .order("criado_em", { ascending: false });
  // Operador (caixa) só enxerga as próprias vendas; o administrador vê todas
  if (sessao.perfil === "operador") query = query.eq("operador_id", sessao.id);
  const { data: vendas, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(vendas);
}

export async function POST(req: Request) {
  const acesso = await exigirApi();
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;
  const parsed = vendaSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const v = parsed.data;
  const db = createServerClient();

  const { data: vendaId, error } = await db.rpc("fechar_venda", {
    p_tenant_id: sessao.tenantId,
    p_itens: v.itens,
    p_forma_pagamento: v.forma_pagamento,
    p_desconto: v.desconto,
    p_valor_recebido: v.valor_recebido ?? null,
    p_operador_id: sessao.id,
    p_operador_nome: sessao.nome,
    p_cliente_id: v.cliente_id ?? null,
    p_entrega: v.entrega,
    p_entrega_endereco: v.entrega ? (v.entrega_endereco ?? null) : null,
    p_chave: v.chave ?? null,
    p_offline: v.offline,
    p_criado_em: v.offline ? (v.criado_em ?? null) : null,
  });
  if (error) {
    // Erros de regra (estoque insuficiente etc.) vêm de raise exception (P0001)
    const status = error.code === "P0001" ? 422 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  const { data: venda } = await db.from("vendas").select(SELECT_VENDA).eq("id", vendaId).single();
  return NextResponse.json(venda, { status: 201 });
}
