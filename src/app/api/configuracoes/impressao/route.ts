import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirApi } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

const schema = z.object({ largura_cupom: z.union([z.literal(58), z.literal(80)], { error: "Largura do papel: escolha 58 ou 80 mm" }) });

export async function PUT(req: Request) {
  const acesso = await exigirApi(["admin"]);
  if (!acesso.ok) return acesso.resposta;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const { error } = await createServerClient().from("tenants").update(parsed.data).eq("id", acesso.sessao.tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
