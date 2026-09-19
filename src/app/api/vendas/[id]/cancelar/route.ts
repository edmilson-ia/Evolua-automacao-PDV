import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirApi } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

const schema = z.object({
  motivo: z
    .string({ error: "Informe o motivo do cancelamento" })
    .trim()
    .min(3, "Informe o motivo do cancelamento")
    .max(200, "Motivo muito longo (máx. 200)"),
});

// Cancelar venda já concluída é ação de administrador: mexe no caixa e no estoque.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirApi(["admin"]);
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Venda inválida" }, { status: 400 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const { error } = await createServerClient().rpc("cancelar_venda", {
    p_tenant_id: sessao.tenantId,
    p_venda_id: id,
    p_motivo: parsed.data.motivo,
    p_operador_id: sessao.id,
    p_operador_nome: sessao.nome,
  });

  if (error) {
    // PGRST202 = a função ainda não existe no banco (migration 0004 não aplicada)
    if (error.code === "PGRST202") {
      return NextResponse.json(
        { error: "Falta aplicar a migration 0004_cancelar_venda.sql no Supabase (SQL Editor)." },
        { status: 501 },
      );
    }
    // P0001 = regra de negócio (venda não encontrada / já cancelada)
    return NextResponse.json({ error: error.message }, { status: error.code === "P0001" ? 409 : 500 });
  }
  return NextResponse.json({ ok: true });
}
