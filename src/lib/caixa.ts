import { createServerClient } from "@/lib/supabase/server";
import { COLUNAS_CAIXA, type Caixa, type CaixaAberto, type ResumoCaixa } from "@/types/caixa";

/** O caixa aberto deste operador (um por operador), ou null. */
export async function getCaixaAberto(tenantId: string, operadorId: string): Promise<CaixaAberto | null> {
  const { data } = await createServerClient()
    .from("caixas")
    .select("id, terminal, aberto_em, valor_inicial")
    .eq("tenant_id", tenantId)
    .eq("operador_id", operadorId)
    .eq("status", "aberto")
    .maybeSingle();
  return data ? { ...data, valor_inicial: Number(data.valor_inicial) } : null;
}

/** Caixa da loja pelo id (a loja SEMPRE vem da sessão). */
export async function getCaixa(tenantId: string, id: string): Promise<Caixa | null> {
  const { data } = await createServerClient().from("caixas").select(COLUNAS_CAIXA).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  return (data as Caixa | null) ?? null;
}

/** Resumo em tempo real de um caixa (calculado no banco: canceladas ficam fora). */
export async function getResumoCaixa(tenantId: string, caixaId: string): Promise<ResumoCaixa | null> {
  const { data } = await createServerClient().rpc("caixa_resumo", { p_tenant_id: tenantId, p_caixa_id: caixaId });
  return (data as ResumoCaixa | null) ?? null;
}

/** Códigos de erro das funções do caixa: P0002 = não encontrado, P0004 = sem permissão, P0001 = regra de negócio. */
export function statusDoErroCaixa(code: string | undefined): number {
  if (code === "P0002") return 404;
  if (code === "P0004") return 403;
  if (code === "23505") return 409; // corrida: o outro pedido abriu o caixa primeiro
  if (code === "P0001") return 422;
  return 500;
}

/** PGRST202 = a função ainda não existe no banco (migration 0008 não aplicada). */
export const ERRO_MIGRATION_CAIXA = "Falta aplicar a migration 0008_caixa.sql no Supabase (SQL Editor).";
