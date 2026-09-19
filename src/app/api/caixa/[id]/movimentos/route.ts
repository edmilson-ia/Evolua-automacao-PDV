import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirApi } from "@/lib/auth";
import { ERRO_MIGRATION_CAIXA, statusDoErroCaixa } from "@/lib/caixa";
import { createServerClient } from "@/lib/supabase/server";
import { movimentoCaixaSchema } from "@/types/caixa";

// Sangria (tira dinheiro do caixa) ou suprimento (coloca). Só quem abriu o caixa, ou um administrador.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirApi();
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;
  const { id } = await params;
  const parsed = movimentoCaixaSchema.safeParse(await req.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) {
    return NextResponse.json({ error: parsed.success ? "Caixa inválido" : (parsed.error.issues[0]?.message ?? "Dados inválidos") }, { status: 400 });
  }
  const { error } = await createServerClient().rpc("movimentar_caixa", {
    p_tenant_id: sessao.tenantId,
    p_caixa_id: id,
    p_tipo: parsed.data.tipo,
    p_valor: parsed.data.valor,
    p_motivo: parsed.data.motivo,
    p_operador_id: sessao.id,
    p_operador_nome: sessao.nome,
    p_admin: sessao.perfil === "admin",
  });
  if (error) {
    if (error.code === "PGRST202") return NextResponse.json({ error: ERRO_MIGRATION_CAIXA }, { status: 501 });
    return NextResponse.json({ error: error.message }, { status: statusDoErroCaixa(error.code) });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
