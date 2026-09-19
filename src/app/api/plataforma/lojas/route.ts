import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirApiPlataforma } from "@/lib/auth";
import { slugSchema } from "@/lib/loja";
import { criarProdutosDeExemplo } from "@/lib/exemplos";
import { fimDoTeste } from "@/lib/teste";
import { createServerClient } from "@/lib/supabase/server";
import { criarUsuario } from "@/lib/supabase/auth-admin";
import { normalizarTelefone } from "@/lib/telefone";

const schema = z.object({
  nome_fantasia: z.string().trim().min(2, "Informe o nome da loja").max(60, "Nome muito longo (máx. 60)"),
  slug: slugSchema,
  admin: z.object({
    nome: z.string().trim().min(2, "Informe o nome do administrador").max(60),
    telefone: z.string().refine((v) => normalizarTelefone(v) !== null, "Telefone inválido: informe o DDD e o número"),
    senha: z.string().min(8, "A senha precisa de pelo menos 8 caracteres").max(72),
  }),
  // Dias de teste grátis (0 = loja definitiva, sem prazo). O teste bloqueia o acesso ao vencer, sem apagar nada.
  dias_teste: z.coerce.number().int("Dias de teste inválido").min(0, "Dias de teste inválido").max(90, "O teste pode ter no máximo 90 dias").default(7),
  com_exemplos: z.boolean().default(false),
});

// Onboarding: o dono da plataforma cria a loja e o primeiro administrador dela.
export async function POST(req: Request) {
  const acesso = await exigirApiPlataforma();
  if (!acesso.ok) return acesso.resposta;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const { nome_fantasia, slug, admin, dias_teste, com_exemplos } = parsed.data;
  const db = createServerClient();

  const teste_ate = dias_teste > 0 ? fimDoTeste(dias_teste).toISOString() : null;
  const { data: loja, error } = await db.from("tenants").insert({ nome_fantasia, slug, teste_ate }).select("id, slug").single();
  if (error) {
    // 23505 = slug (endereço) já usado por outra loja
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: status === 409 ? "Este endereço já está em uso" : error.message }, { status });
  }

  const r = await criarUsuario({
    telefone: normalizarTelefone(admin.telefone)!,
    senha: admin.senha,
    nome: admin.nome,
    perfil: "admin",
    tenantId: loja.id,
    slug: loja.slug,
  });
  if (!r.ok) {
    // Não deixa loja sem administrador: desfaz a loja que acabamos de criar (por id)
    await db.from("tenants").delete().eq("id", loja.id);
    return NextResponse.json({ error: r.erro }, { status: 400 });
  }
  // Loja de demonstração: produtos de exemplo. Se falhar, a loja continua criada (é só um adicional)
  let exemplos = 0;
  if (com_exemplos) exemplos = await criarProdutosDeExemplo(db, loja.id).catch(() => 0);
  return NextResponse.json({ id: loja.id, slug: loja.slug, teste_ate, exemplos }, { status: 201 });
}
