import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirApi } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { clienteSchema, COLUNAS_CLIENTE } from "@/types/cliente";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const acesso = await exigirApi(["admin"]);
  if (!acesso.ok) return acesso.resposta;
  const { id } = await params;
  const parsed = clienteSchema.safeParse(await req.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) {
    return NextResponse.json({ error: parsed.success ? "Cliente inválido" : (parsed.error.issues[0]?.message ?? "Dados inválidos") }, { status: 400 });
  }
  const { data, error } = await createServerClient()
    .from("clientes")
    .update(parsed.data)
    .eq("id", id)
    .eq("tenant_id", acesso.sessao.tenantId)
    .eq("ativo", true)
    .select(COLUNAS_CLIENTE)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Já existe um cliente com este telefone" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  return NextResponse.json(data);
}

// Exclusão lógica: o cadastro sai da lista, mas o histórico futuro (vendas do cliente) não se perde.
export async function DELETE(_req: Request, { params }: Ctx) {
  const acesso = await exigirApi(["admin"]);
  if (!acesso.ok) return acesso.resposta;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Cliente inválido" }, { status: 400 });
  const { data, error } = await createServerClient()
    .from("clientes")
    .update({ ativo: false })
    .eq("id", id)
    .eq("tenant_id", acesso.sessao.tenantId)
    .eq("ativo", true)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
