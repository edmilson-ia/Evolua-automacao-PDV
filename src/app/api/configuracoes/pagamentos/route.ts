import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirApi } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

// Texto vazio vira null (campo limpo = sem PIX configurado)
const opcional = (max: number, msg: string) =>
  z.string().trim().max(max, msg).nullable().transform((v) => v || null);

const schema = z.object({
  pix_chave: opcional(77, "Chave PIX muito longa"),
  pix_cidade: opcional(15, "Cidade: no máximo 15 caracteres (padrão do PIX)"),
  taxa_debito: z.coerce.number().min(0, "Taxa inválida").max(30, "Taxa acima de 30%"),
  taxa_credito: z.coerce.number().min(0, "Taxa inválida").max(30, "Taxa acima de 30%"),
});

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
