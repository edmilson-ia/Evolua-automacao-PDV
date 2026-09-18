import { NextResponse } from "next/server";
import { exigirApi, getSessao } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import { produtoSchema } from "@/types/produto";

const COLUNAS_OPERADOR =
  "id, tenant_id, categoria_id, nome, sku, descricao, imagem_url, preco_venda, quantidade, estoque_minimo, unidade, visivel_catalogo, ativo";

export async function GET(req: Request) {
  const negado = await exigirApi();
  if (negado) return negado;
  const busca = new URL(req.url).searchParams.get("q");
  // Preço de custo é informação do administrador: o operador (caixa) não o recebe
  const admin = (await getSessao())?.perfil === "admin";
  const db = createServerClient();
  let query = db
    .from("produtos")
    .select(admin ? "*" : COLUNAS_OPERADOR)
    .eq("tenant_id", getTenantId())
    .eq("ativo", true)
    .order("nome");
  if (busca) query = query.or(`nome.ilike.%${busca}%,sku.ilike.%${busca}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const negado = await exigirApi(["admin"]);
  if (negado) return negado;
  const parsed = produtoSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const db = createServerClient();
  const { data, error } = await db
    .from("produtos")
    .insert({ ...parsed.data, tenant_id: getTenantId() })
    .select()
    .single();
  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    const message = status === 409 ? "SKU já cadastrado" : error.message;
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json(data, { status: 201 });
}
