import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { opcoesCookieSessao } from "@/lib/auth";
import { registrarFalha, segundosBloqueado } from "@/lib/rate-limit";
import { COOKIE_SESSAO, criarToken } from "@/lib/session";
import { criarUsuario, listarSuperAdmins } from "@/lib/supabase/auth-admin";
import { normalizarTelefone } from "@/lib/telefone";

const schema = z.object({
  codigo: z.string().min(1, "Informe o código de configuração"),
  nome: z.string().trim().min(2, "Informe o nome").max(60),
  telefone: z.string().refine((v) => normalizarTelefone(v) !== null, "Telefone inválido: informe o DDD e o número"),
  senha: z.string().min(8, "A senha precisa de pelo menos 8 caracteres").max(72),
});

const iguais = (a: string, b: string) => {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
};

// Primeiro acesso da plataforma: cria o SUPER-ADMIN (dono). Só funciona enquanto não existir nenhum
// e exige o SETUP_CODE do .env.local (prova de que quem configura tem acesso ao servidor).
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const chave = `plataforma-setup|${ip}`;
  const espera = segundosBloqueado(chave);
  if (espera > 0) {
    return NextResponse.json({ error: `Muitas tentativas. Aguarde ${espera}s e tente de novo.` }, { status: 429 });
  }
  const esperado = process.env.SETUP_CODE;
  if (!esperado) return NextResponse.json({ error: "SETUP_CODE não configurado no servidor" }, { status: 500 });
  if (!iguais(parsed.data.codigo.trim(), esperado)) {
    registrarFalha(chave);
    return NextResponse.json({ error: "Código de configuração incorreto" }, { status: 403 });
  }
  if ((await listarSuperAdmins()).length > 0) {
    return NextResponse.json({ error: "A plataforma já foi configurada. Entre com o seu login." }, { status: 403 });
  }

  const r = await criarUsuario({
    telefone: normalizarTelefone(parsed.data.telefone)!,
    senha: parsed.data.senha,
    nome: parsed.data.nome,
    perfil: "super_admin",
    tenantId: null,
    slug: "plataforma",
  });
  if (!r.ok || !r.usuario) return NextResponse.json({ error: r.ok ? "Falha ao criar usuário" : r.erro }, { status: 400 });

  const token = await criarToken({ id: r.usuario.id, email: r.usuario.email, nome: r.usuario.nome, perfil: "super_admin", tenantId: null });
  const res = NextResponse.json({ ok: true, destino: "/plataforma" }, { status: 201 });
  res.cookies.set(COOKIE_SESSAO, token, opcoesCookieSessao);
  return res;
}
