import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirApi } from "@/lib/auth";
import { ERRO_MIGRATION_CAIXA, statusDoErroCaixa } from "@/lib/caixa";
import { createServerClient } from "@/lib/supabase/server";
import { fecharCaixaSchema } from "@/types/caixa";

// Fecha o caixa com a conferência por forma de pagamento. Só quem abriu, ou um administrador.
// O esperado é calculado no banco (o cliente só informa o que CONTOU: fechamento "cego").
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirApi();
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;
  const { id } = await params;
  const parsed = fecharCaixaSchema.safeParse(await req.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) {
    return NextResponse.json({ error: parsed.success ? "Caixa inválido" : (parsed.error.issues[0]?.message ?? "Dados inválidos") }, { status: 400 });
  }
  const { error } = await createServerClient().rpc("fechar_caixa", {
    p_tenant_id: sessao.tenantId,
    p_caixa_id: id,
    p_contados: parsed.data.contados,
    p_observacao: parsed.data.observacao ?? null,
    p_operador_id: sessao.id,
    p_operador_nome: sessao.nome,
    p_admin: sessao.perfil === "admin",
  });
  if (error) {
    if (error.code === "PGRST202") return NextResponse.json({ error: ERRO_MIGRATION_CAIXA }, { status: 501 });
    // "já foi fechado" é conflito; o resto segue o código do banco
    const status = error.code === "P0001" && /já foi fechado/.test(error.message) ? 409 : statusDoErroCaixa(error.code);
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ ok: true });
}
