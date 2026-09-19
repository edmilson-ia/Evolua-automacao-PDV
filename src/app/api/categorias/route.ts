import { NextResponse } from "next/server";
import { exigirApi } from "@/lib/auth";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const acesso = await exigirApi(["admin"]);
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;
  const { data, error } = await createServerClient()
    .from("categorias")
    .select("id, nome")
    .eq("tenant_id", sessao.tenantId)
    .order("nome");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const acesso = await exigirApi(["admin"]);
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;
  const parsed = z.object({ nome: z.string().trim().min(1, "Nome obrigatório") }).safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const db = createServerClient();
  const { data, error } = await db
    .from("categorias")
    .insert({ nome: parsed.data.nome, tenant_id: sessao.tenantId })
    .select("id, nome")
    .single();
  if (error) {
    if (error.code === "23505") {
      // Já existe: devolve a existente (idempotente para o formulário)
      const { data: existente } = await db
        .from("categorias")
        .select("id, nome")
        .eq("tenant_id", sessao.tenantId)
        .eq("nome", parsed.data.nome)
        .single();
      return NextResponse.json(existente);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
