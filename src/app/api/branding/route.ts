import { NextResponse } from "next/server";
import { exigirApi } from "@/lib/auth";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { ERRO_IMAGEM_FORA, prefixoImagensDaLoja } from "@/lib/storage";

// Só aceitamos imagens enviadas pelo sistema para a PRÓPRIA loja: o servidor busca essas URLs para gerar
// os ícones do PWA (uma URL arbitrária seria um risco de SSRF) e uma loja não pode usar a imagem de outra.
function brandingSchema(tenantId: string) {
  const urlDaLoja = z.string().url().refine((u) => u.startsWith(prefixoImagensDaLoja(tenantId)), ERRO_IMAGEM_FORA);
  return z.object({
    nome_fantasia: z.string().trim().min(1, "Informe o nome fantasia").max(60, "Nome muito longo (máx. 60)"),
    cor_primaria: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida"),
    logo_url: urlDaLoja.nullable(),
    icone_url: urlDaLoja.nullable(),
  });
}

export async function PUT(req: Request) {
  const acesso = await exigirApi(["admin"]);
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;
  const parsed = brandingSchema(sessao.tenantId).safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const { error } = await createServerClient().from("tenants").update(parsed.data).eq("id", sessao.tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
