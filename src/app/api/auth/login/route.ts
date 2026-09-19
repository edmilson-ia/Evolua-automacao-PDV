import { NextResponse } from "next/server";
import { z } from "zod";
import { opcoesCookieLoja, opcoesCookieSessao } from "@/lib/auth";
import { slugSchema } from "@/lib/loja";
import { limparFalhas, registrarFalha, segundosBloqueado } from "@/lib/rate-limit";
import { COOKIE_LOJA, COOKIE_SESSAO, criarToken, paginaInicial, type Sessao } from "@/lib/session";
import { buscarUsuario, verificarSenha } from "@/lib/supabase/auth-admin";
import { normalizarTelefone } from "@/lib/telefone";
import { getLojaPorSlug } from "@/lib/tenant";

// "loja" = endereço da loja (slug). Sem ela, é o login do dono da plataforma (super-admin).
// "identificador" = telefone. Se vier um e-mail (contém "@"), é o acesso de um usuário antigo,
// criado antes do login por telefone: continua funcionando até ele cadastrar o telefone.
const schema = z.object({
  loja: slugSchema.optional(),
  identificador: z.string().trim().min(1).max(120),
  senha: z.string().min(1),
});

const RECUSADO = { error: "Telefone ou senha incorretos" };

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe telefone e senha" }, { status: 400 });
  const { loja: slug, identificador, senha } = parsed.data;

  let tenantId: string | null = null;
  if (slug) {
    const loja = await getLojaPorSlug(slug);
    if (!loja) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
    if (loja.teste_vencido) return NextResponse.json({ error: "O período de teste desta loja terminou. Fale com o suporte para ativar." }, { status: 403 });
    if (!loja.ativo) return NextResponse.json({ error: "Esta loja está suspensa. Fale com o suporte." }, { status: 403 });
    tenantId = loja.id;
  }

  const porEmail = identificador.includes("@");
  const telefone = porEmail ? null : normalizarTelefone(identificador);
  const chaveId = porEmail ? identificador.toLowerCase() : (telefone ?? identificador.replace(/\D/g, ""));

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const chave = `${ip}|${slug ?? "plataforma"}|${chaveId}`;
  const espera = segundosBloqueado(chave);
  if (espera > 0) {
    return NextResponse.json({ error: `Muitas tentativas. Aguarde ${espera}s e tente de novo.` }, { status: 429 });
  }

  if (!porEmail && !telefone) {
    registrarFalha(chave);
    return NextResponse.json({ error: "Telefone inválido: informe o DDD e o número" }, { status: 400 });
  }

  let usuario;
  try {
    // O login é pelo telefone; descobrimos o e-mail interno do usuário DESTA loja para conferir a senha
    const achado = await buscarUsuario(tenantId, porEmail ? { email: identificador } : { telefone: telefone! });
    usuario = achado ? await verificarSenha(achado.email, senha) : null;
  } catch {
    return NextResponse.json({ error: "Serviço de login indisponível. Tente novamente." }, { status: 503 });
  }
  // Mesma mensagem para telefone inexistente, senha errada ou usuário sem perfil: não revela qual falhou
  if (!usuario || !usuario.perfil) {
    registrarFalha(chave);
    return NextResponse.json(RECUSADO, { status: 401 });
  }

  limparFalhas(chave);
  const base = { id: usuario.id, email: usuario.email, nome: usuario.nome };
  const sessao: Sessao =
    tenantId && usuario.perfil !== "super_admin"
      ? { ...base, perfil: usuario.perfil, tenantId }
      : { ...base, perfil: "super_admin", tenantId: null };

  const res = NextResponse.json({ ok: true, destino: paginaInicial(sessao.perfil) });
  res.cookies.set(COOKIE_SESSAO, await criarToken(sessao), opcoesCookieSessao);
  if (slug) res.cookies.set(COOKIE_LOJA, slug, opcoesCookieLoja);
  return res;
}
