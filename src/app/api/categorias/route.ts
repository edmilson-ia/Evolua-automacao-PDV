import { NextResponse } from "next/server";
import { exigirApi } from "@/lib/auth";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";

export async function GET() {
  const negado = await exigirApi(["admin"]);
  if (negado) return negado;
  const { data, error } = await createServerClient()
    .from("categorias")
    .select("id, nome")
    .eq("tenant_id", getTenantId())
    .order("nome");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const negado = await exigirApi(["admin"]);
  if (negado) return negado;
  const parsed = z.object({ nome: z.string().trim().min(1, "Nome obrigatório") }).safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const db = createServerClient();
  const { data, error } = await db
    .from("categorias")
    .insert({ nome: parsed.data.nome, tenant_id: getTenantId() })
    .select("id, nome")
    .single();
  if (error) {
    if (error.code === "23505") {
      // Já existe: devolve a existente (idempotente para o formulário)
      const { data: existente } = await db
        .from("categorias")
        .select("id, nome")
        .eq("tenant_id", getTenantId())
        .eq("nome", parsed.data.nome)
        .single();
      return NextResponse.json(existente);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
