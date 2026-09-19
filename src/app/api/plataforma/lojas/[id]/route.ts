import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirApiPlataforma } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { esquecerCacheLoja } from "@/lib/tenant";
import { prorrogarTeste } from "@/lib/teste";

const schema = z.union([
  z.object({ ativo: z.boolean() }),
  z.object({ acao: z.literal("prorrogar"), dias: z.coerce.number().int().min(1, "Informe de 1 a 90 dias").max(90, "Informe de 1 a 90 dias") }),
  z.object({ acao: z.literal("ativar") }),
]);

// Suspender/reativar a loja, prorrogar o teste grátis ou ativá-la de vez (tira o prazo). Vale para o acesso em até 30 s.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirApiPlataforma();
  if (!acesso.ok) return acesso.resposta;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const db = createServerClient();
  const corpo = parsed.data;
  let mudanca: { ativo?: boolean; teste_ate?: string | null };
  if ("ativo" in corpo) mudanca = { ativo: corpo.ativo };
  else if (corpo.acao === "ativar") mudanca = { teste_ate: null };
  else {
    const { data: atual } = await db.from("tenants").select("teste_ate").eq("id", id).maybeSingle();
    if (!atual) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
    if (!atual.teste_ate) return NextResponse.json({ error: "Esta loja já é definitiva (sem prazo de teste)" }, { status: 400 });
    mudanca = { teste_ate: prorrogarTeste(atual.teste_ate, corpo.dias).toISOString() };
  }
  const { data, error } = await db.from("tenants").update(mudanca).eq("id", id).select("id, teste_ate").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  esquecerCacheLoja(id);
  return NextResponse.json({ ok: true, teste_ate: data.teste_ate });
}
