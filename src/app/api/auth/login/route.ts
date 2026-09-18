import { NextResponse } from "next/server";
import { z } from "zod";
import { opcoesCookieSessao } from "@/lib/auth";
import { limparFalhas, registrarFalha, segundosBloqueado } from "@/lib/rate-limit";
import { COOKIE_SESSAO, criarToken } from "@/lib/session";
import { listarUsuarios, verificarSenha } from "@/lib/supabase/auth-admin";
import { normalizarTelefone } from "@/lib/telefone";

// "identificador" = telefone. Se vier um e-mail (contém "@"), é o acesso de um usuário antigo,
// criado antes do login por telefone: continua funcionando até ele cadastrar o telefone.
const schema = z.object({ identificador: z.string().trim().min(1).max(120), senha: z.string().min(1) });

const RECUSADO = { error: "Telefone ou senha incorretos" };

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe telefone e senha" }, { status: 400 });
  const { identificador, senha } = parsed.data;

  const porEmail = identificador.includes("@");
  const telefone = porEmail ? null : normalizarTelefone(identificador);
  const chaveId = porEmail ? identificador.toLowerCase() : (telefone ?? identificador.replace(/\D/g, ""));

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const chave = `${ip}|${chaveId}`;
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
    // O login é pelo telefone; descobrimos o e-mail interno do usuário para conferir a senha
    const email = porEmail
      ? identificador.toLowerCase()
      : (await listarUsuarios()).find((u) => u.telefone === telefone)?.email;
    usuario = email ? await verificarSenha(email, senha) : null;
  } catch {
    return NextResponse.json({ error: "Serviço de login indisponível. Tente novamente." }, { status: 503 });
  }
  // Mesma mensagem para telefone inexistente, senha errada ou usuário sem perfil: não revela qual falhou
  if (!usuario || !usuario.perfil) {
    registrarFalha(chave);
    return NextResponse.json(RECUSADO, { status: 401 });
  }

  limparFalhas(chave);
  const token = await criarToken({ id: usuario.id, email: usuario.email, nome: usuario.nome, perfil: usuario.perfil });
  const res = NextResponse.json({ ok: true, destino: usuario.perfil === "admin" ? "/dashboard" : "/pdv" });
  res.cookies.set(COOKIE_SESSAO, token, opcoesCookieSessao);
  return res;
}
