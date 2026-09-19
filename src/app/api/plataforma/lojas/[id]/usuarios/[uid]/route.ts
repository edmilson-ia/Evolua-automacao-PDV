import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirApiPlataforma } from "@/lib/auth";
import { atualizarUsuario } from "@/lib/supabase/auth-admin";

const schema = z.object({ senha: z.string().min(8, "A senha precisa de pelo menos 8 caracteres").max(72) });

// Redefinir a senha de um usuário de uma loja (ex.: administrador que esqueceu a senha).
// O usuário precisa pertencer à loja da URL: senão é 404.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string; uid: string }> }) {
  const acesso = await exigirApiPlataforma();
  if (!acesso.ok) return acesso.resposta;
  const { id, uid } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(uid).success || !parsed.success) {
    return NextResponse.json({ error: parsed.success ? "Dados inválidos" : (parsed.error.issues[0]?.message ?? "Dados inválidos") }, { status: 400 });
  }
  const r = await atualizarUsuario(uid, id, { senha: parsed.data.senha });
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.naoEncontrado ? 404 : 400 });
  return NextResponse.json({ ok: true });
}
