import { NextResponse } from "next/server";
import { exigirApi } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import { produtoSchema } from "@/types/produto";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const negado = await exigirApi(["admin"]);
  if (negado) return negado;
  const { id } = await params;
  const { data, error } = await createServerClient()
    .from("produtos")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", getTenantId())
    .single();
  if (error) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: Ctx) {
  const negado = await exigirApi(["admin"]);
  if (negado) return negado;
  const { id } = await params;
  const parsed = produtoSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { data, error } = await createServerClient()
    .from("produtos")
    .update(parsed.data)
    .eq("id", id)
    .eq("tenant_id", getTenantId())
    .select()
    .single();
  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    const message = status === 409 ? "SKU já cadastrado" : error.message;
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json(data);
}

// Exclusão lógica: preserva histórico de vendas e movimentos.
export async function DELETE(_req: Request, { params }: Ctx) {
  const negado = await exigirApi(["admin"]);
  if (negado) return negado;
  const { id } = await params;
  const { error } = await createServerClient()
    .from("produtos")
    .update({ ativo: false })
    .eq("id", id)
    .eq("tenant_id", getTenantId());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
