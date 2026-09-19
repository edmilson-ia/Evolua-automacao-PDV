import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { registrarFalha, segundosBloqueado } from "@/lib/rate-limit";
import { atualizarUsuario, buscarUsuario } from "@/lib/supabase/auth-admin";
import { normalizarTelefone } from "@/lib/telefone";

const schema = z.object({
  identificador: z.string().trim().min(1, "Informe o telefone").max(120),
  codigo: z.string().min(1, "Informe o código de configuração"),
  senha: z.string().min(8, "A senha precisa de pelo menos 8 caracteres").max(72),
});

const iguais = (a: string, b: string) => {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
};

// Recuperação de senha do DONO DA PLATAFORMA (super-admin; não há e-mail nem SMS): exige o SETUP_CODE do
// .env.local, prova de que quem pede tem acesso ao servidor. O SETUP_CODE é da plataforma e nunca vai para
// uma loja: operador pede ao administrador da loja; administrador da loja pede ao dono da plataforma.
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const chave = `recuperar|${ip}`;
  const espera = segundosBloqueado(chave);
  if (espera > 0) {
    return NextResponse.json({ error: `Muitas tentativas. Aguarde ${espera}s e tente de novo.` }, { status: 429 });
  }

  const esperado = process.env.SETUP_CODE;
  if (!esperado) return NextResponse.json({ error: "Código de configuração não definido no servidor" }, { status: 500 });
  if (!iguais(parsed.data.codigo.trim(), esperado)) {
    registrarFalha(chave);
    return NextResponse.json({ error: "Código de configuração incorreto" }, { status: 403 });
  }

  const telefone = normalizarTelefone(parsed.data.identificador);
  const usuario = telefone ? await buscarUsuario(null, { telefone }) : null;
  if (!usuario) {
    registrarFalha(chave);
    return NextResponse.json({ error: "Não encontramos um usuário da plataforma com esse telefone" }, { status: 404 });
  }

  const r = await atualizarUsuario(usuario.id, null, { senha: parsed.data.senha });
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
