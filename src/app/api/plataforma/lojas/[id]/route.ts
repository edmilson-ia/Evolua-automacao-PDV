import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirApiPlataforma } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { esquecerCacheLoja } from "@/lib/tenant";

const schema = z.object({ ativo: z.boolean() });

// Suspender (ativo=false) ou reativar uma loja. Loja suspensa não loga e perde o acesso em até 30 s.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirApiPlataforma();
  if (!acesso.ok) return acesso.resposta;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const { data, error } = await createServerClient().from("tenants").update({ ativo: parsed.data.ativo }).eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  esquecerCacheLoja(id);
  return NextResponse.json({ ok: true });
}
