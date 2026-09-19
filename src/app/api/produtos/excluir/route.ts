import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirApi } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

const schema = z.object({
  ids: z.array(z.string().uuid("Produto inválido")).min(1, "Nenhum produto selecionado").max(1000, "No máximo 1.000 produtos por vez"),
});

/**
 * Exclui VÁRIOS produtos de uma vez (só admin). É a mesma exclusão lógica do botão "Excluir": o produto sai das listas
 * (ativo = false), mas o histórico de vendas e movimentos fica. Só mexe em produtos da loja da sessão; ids de outra
 * loja simplesmente não contam. Fica registrado na auditoria (com os ids, para dar para desfazer).
 */
export async function POST(req: Request) {
  const acesso = await exigirApi(["admin"]);
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const ids = [...new Set(parsed.data.ids)];
  const db = createServerClient();

  const excluidos: string[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db
      .from("produtos")
      .update({ ativo: false, atualizado_em: new Date().toISOString() })
      .eq("tenant_id", sessao.tenantId)
      .eq("ativo", true)
      .in("id", ids.slice(i, i + 100))
      .select("id");
    if (error) return NextResponse.json({ error: error.message, excluidos: excluidos.length }, { status: 500 });
    excluidos.push(...(data ?? []).map((p) => p.id as string));
  }

  if (excluidos.length > 0) {
    await db.from("auditoria").insert({
      tenant_id: sessao.tenantId,
      acao: "exclusao_em_massa",
      entidade: "produto",
      operador_id: sessao.id,
      operador_nome: sessao.nome,
      detalhe: { quantidade: excluidos.length, ids: excluidos },
    });
  }
  return NextResponse.json({ excluidos: excluidos.length, ignorados: ids.length - excluidos.length });
}
