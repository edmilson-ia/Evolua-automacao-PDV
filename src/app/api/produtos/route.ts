import { NextResponse } from "next/server";
import { exigirApi } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { ERRO_IMAGEM_FORA, imagemEhDaLoja } from "@/lib/storage";
import { erroDeGravacao } from "@/lib/produtoErros";
import { produtoSchema } from "@/types/produto";

const COLUNAS_OPERADOR =
  "id, tenant_id, categoria_id, nome, sku, codigo_barras, descricao, imagem_url, preco_venda, quantidade, estoque_minimo, unidade, visivel_catalogo, ativo";

export async function GET(req: Request) {
  const acesso = await exigirApi();
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;
  const busca = new URL(req.url).searchParams.get("q");
  // Preço de custo é informação do administrador: o operador (caixa) não o recebe
  const admin = sessao.perfil === "admin";
  const db = createServerClient();
  let query = db
    .from("produtos")
    .select(admin ? "*" : COLUNAS_OPERADOR)
    .eq("tenant_id", sessao.tenantId)
    .eq("ativo", true)
    .order("nome");
  if (busca) query = query.or(`nome.ilike.%${busca}%,sku.ilike.%${busca}%,codigo_barras.ilike.%${busca}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const acesso = await exigirApi(["admin"]);
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;
  const parsed = produtoSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  if (!imagemEhDaLoja(sessao.tenantId, parsed.data.imagem_url)) {
    return NextResponse.json({ error: ERRO_IMAGEM_FORA }, { status: 400 });
  }
  const db = createServerClient();
  const { data, error } = await db
    .from("produtos")
    .insert({ ...parsed.data, tenant_id: sessao.tenantId })
    .select()
    .single();
  if (error) {
    const { status, message } = erroDeGravacao(error);
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json(data, { status: 201 });
}
