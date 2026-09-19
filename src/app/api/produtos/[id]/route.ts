import { NextResponse } from "next/server";
import { exigirApi } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { ERRO_IMAGEM_FORA, imagemEhDaLoja } from "@/lib/storage";
import { erroDeGravacao } from "@/lib/produtoErros";
import { produtoSchema } from "@/types/produto";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const acesso = await exigirApi(["admin"]);
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;
  const { id } = await params;
  const { data, error } = await createServerClient()
    .from("produtos")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", sessao.tenantId)
    .single();
  if (error) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: Ctx) {
  const acesso = await exigirApi(["admin"]);
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;
  const { id } = await params;
  const parsed = produtoSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  if (!imagemEhDaLoja(sessao.tenantId, parsed.data.imagem_url)) {
    return NextResponse.json({ error: ERRO_IMAGEM_FORA }, { status: 400 });
  }
  const { data, error } = await createServerClient()
    .from("produtos")
    .update(parsed.data)
    .eq("id", id)
    .eq("tenant_id", sessao.tenantId)
    .select()
    .maybeSingle();
  if (error) {
    const { status, message } = erroDeGravacao(error);
    return NextResponse.json({ error: message }, { status });
  }
  if (!data) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  return NextResponse.json(data);
}

// Exclusão lógica: preserva histórico de vendas e movimentos.
export async function DELETE(_req: Request, { params }: Ctx) {
  const acesso = await exigirApi(["admin"]);
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;
  const { id } = await params;
  const { data, error } = await createServerClient()
    .from("produtos")
    .update({ ativo: false })
    .eq("id", id)
    .eq("tenant_id", sessao.tenantId)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
