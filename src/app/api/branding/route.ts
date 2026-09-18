import { NextResponse } from "next/server";
import { exigirApi } from "@/lib/auth";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";

// Só aceitamos imagens hospedadas no nosso próprio storage: o servidor busca essas URLs
// para gerar os ícones do PWA, então uma URL arbitrária seria um risco (SSRF).
const PREFIXO_STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`;
const urlDoStorage = z
  .string()
  .url()
  .refine((u) => u.startsWith(PREFIXO_STORAGE), "A imagem precisa ser enviada pelo sistema");

const brandingSchema = z.object({
  nome_fantasia: z.string().trim().min(1, "Informe o nome fantasia").max(60, "Nome muito longo (máx. 60)"),
  cor_primaria: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida"),
  logo_url: urlDoStorage.nullable(),
  icone_url: urlDoStorage.nullable(),
});

export async function PUT(req: Request) {
  const negado = await exigirApi(["admin"]);
  if (negado) return negado;
  const parsed = brandingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const { error } = await createServerClient().from("tenants").update(parsed.data).eq("id", getTenantId());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
