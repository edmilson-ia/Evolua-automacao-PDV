import { NextResponse } from "next/server";
import { exigirApi } from "@/lib/auth";
import { ERRO_MIGRATION_CAIXA, getCaixaAberto, statusDoErroCaixa } from "@/lib/caixa";
import { createServerClient } from "@/lib/supabase/server";
import { getConfigPagamento } from "@/lib/tenant";
import { abrirCaixaSchema } from "@/types/caixa";

// Caixa do próprio usuário: admin e operador (cada um só enxerga e abre o seu).
export async function GET() {
  const acesso = await exigirApi();
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;
  const [caixa, config] = await Promise.all([getCaixaAberto(sessao.tenantId, sessao.id), getConfigPagamento(sessao.tenantId)]);
  return NextResponse.json({ obrigatorio: config.caixa_obrigatorio, caixa });
}

export async function POST(req: Request) {
  const acesso = await exigirApi();
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;
  const parsed = abrirCaixaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const { data, error } = await createServerClient().rpc("abrir_caixa", {
    p_tenant_id: sessao.tenantId,
    p_operador_id: sessao.id,
    p_operador_nome: sessao.nome,
    p_terminal: parsed.data.terminal,
    p_valor_inicial: parsed.data.valor_inicial,
  });
  if (error) {
    if (error.code === "PGRST202") return NextResponse.json({ error: ERRO_MIGRATION_CAIXA }, { status: 501 });
    // regra de negócio de "já aberto" é conflito (409); os demais P0001 são dados inválidos
    const status = error.code === "P0001" && /já (tem|está)/.test(error.message) ? 409 : statusDoErroCaixa(error.code);
    const message = error.code === "23505" ? "Já existe um caixa aberto para este operador ou terminal" : error.message;
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ id: data }, { status: 201 });
}
